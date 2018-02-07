/**
 * Blackbox Exporter HTTP Probe using Cloudflare Worker.
 */

/**
 * Sample modules configuration.
 *
 * This is based on blackbox-exporter's http_probe configuration,
 * see @HttpProbeConfig interface below for supported options.
 */
const modules: { [name: string]: HttpProbeConfig } = {
    http_get_2xx: {
        method: 'GET',
        fail_if_not_matches_regexp: [/ok/]
    },
    http_post_204: {
        method: 'POST',
        allowed_targets: ['https://example.com'],
        headers: {
            'Content-Type': 'application/json'
        },
        body: '{}',
        valid_status_codes: [204],
        fail_if_matches_regexp: [/error/]
    }
}

/**
 * Cloudflare Worker entrypoint
 */
if (typeof addEventListener === 'function') {
    addEventListener('fetch', (e: Event): void => {
        // work around as strict typescript check doesn't allow e to be of type FetchEvent
        const fe = e as FetchEvent
        fe.respondWith(processRequest(fe.request))
    })
}

function processRequest(r: Request): Response | Promise<Response> {
    if (r.method !== 'GET') {
        return errorResponse('sorry, this only accept GET method')
    }

    const [params, err] = parseParams(r)
    if (params === null) {
        // err must be non-null if params is null
        return errorResponse(err!)
    }
    if (!modules.hasOwnProperty(params.module)) {
        return errorResponse(`unknown module: ${params.module}`)
    }

    const module = modules[params.module]
    return doProbe(module, params.target)
}

/**
 * Create an error Response.
 *
 * @param {string | Error} err the error instance or message to show in Response
 * @param {number} status HTTP status code to use in Response
 * @returns {Response} a Response for given error and status
 */
function errorResponse(err: string | Error, status: number = 400): Response {
    const msg = (err instanceof Error) ? err.message : err
    return new Response(`error: ${msg}\n`, {status: status, statusText: 'Bad Request'})
}

/**
 * Parse request params for module and target.
 * Return an Error if either 'module' or 'target' param is missing.
 *
 * @param {Request} r the request to parse
 * @return {[RequestParam , null] | [null , Error]}
 */
export function parseParams(r: Request): [RequestParam, null] | [null, Error] {
    const url = new URL(r.url)
    if (!url.searchParams.has('module')) {
        return [null, new Error('module parameter is missing')]
    }
    if (!url.searchParams.has('target')) {
        return [null, new Error('target parameter is missing')]
    }
    const result = {
        module: url.searchParams.get('module') || '',
        target: url.searchParams.get('target') || ''
    }
    return [result, null]
}

async function doProbe(config: HttpProbeConfig, target: string): Promise<Response> {
    const probe = new HttpProbe(config)
    const [req, err] = buildRequest(probe, target)
    if (err !== null) {
        return errorResponse(err)
    }

    // performance.now() is not available in CF workers
    const before = Date.now()
    const resp = await fetch(req!)
    // Read the full response's body first to measure the total response time.
    // We assume body to be text as we only care about text in (optional) validation step later,
    // but other content type shouldn't affect this measurement.
    const body = await resp.text()
    const after = Date.now()

    const success = await validateResponse(probe, resp, body)
    const contentLength = parseInt(resp.headers.get('content-length') || '-1')
    const probeResult = {
        probe_success: success,
        probe_duration_seconds: (after - before) / 1000,
        probe_http_status_code: resp.status,
        probe_http_redirected: resp.redirected,
        probe_http_content_length: contentLength,
    }
    return buildResponse(probeResult)
}

/**
 * Build a probing request to send for given probe config and target.
 *
 * @param {HttpProbe} probe
 * @param {string} target
 * @return {[Request , null] | [null , Error]}
 */
export function buildRequest(probe: HttpProbe, target: string): [Request, null] | [null, Error] {
    if (probe.body !== '' && (probe.method === 'GET' || probe.method === 'HEAD')) {
        return [null, new Error('body is not allowed for GET or HEAD request')]
    }
    const normTarget = target.toLowerCase()
    if (!normTarget.startsWith('http://') && !normTarget.startsWith('https://')) {
        return [null, new Error('target must start with either http:// or https://: ' + normTarget)]
    }
    if (probe.allowedTargets.length > 0) {
        if (!probe.allowedTargets.some(isEqualOrMatched(normTarget))) {
            return [null, new Error('target is not allowed in probe config: ' + normTarget)]
        }
    }

    const options: RequestInit = {
        method: probe.method,
        redirect: probe.noFollowRedirects ? 'manual' : 'follow'
    }
    if (Object.keys(probe.headers)) {
        options.headers = new Headers(probe.headers)
    }
    if (probe.body !== '') {
        options.body = probe.body
    }
    return [new Request(normTarget, options), null]
}

/**
 * Validate received response based on given probe config.
 *
 * @param {HttpProbe} probe
 * @param {Response} resp
 * @param {string | null} body optional body text in case it is already read from the response,
 *        otherwise will be read from response as `resp.text()`
 * @return {Promise<boolean>}
 */
export async function validateResponse(probe: HttpProbe, resp: Response, body: string | null = null): Promise<boolean> {
    const validStatus = validateResponseStatus(resp.status, probe.validStatusCodes)
    if (!validStatus) {
        return false
    }

    if (body === null) {
        body = await resp.text()
    }
    return validateResponseBody(body, probe)
}

function validateResponseStatus(status: number, validStatus: Array<number> | HttpStatusCodeClass): boolean {
    switch (validStatus) {
        case HttpStatusCodeClass.Http_1xx:
            if (status < 100 || status >= 200) {
                return false
            }
            break
        case HttpStatusCodeClass.Http_2xx:
            if (status < 200 || status >= 300) {
                return false
            }
            break
        case HttpStatusCodeClass.Http_3xx:
            if (status < 300 || status >= 400) {
                return false
            }
            break
        case HttpStatusCodeClass.Http_4xx:
            if (status < 400 || status >= 500) {
                return false
            }
            break
        case HttpStatusCodeClass.Http_5xx:
            if (status < 500 || status >= 600) {
                return false
            }
            break
        default:
            if (!((validStatus as Array<number>).includes(status))) {
                return false
            }
    }
    return true
}

function validateResponseBody(text: string, probe: HttpProbe): boolean {
    for (let r of probe.failIfMatchesRegexp) {
        if (r.test(text)) {
            return false
        }
    }
    for (let r of probe.failIfNotMatchesRegexp) {
        if (!r.test(text)) {
            return false
        }
    }
    return true
}

/**
 * Build output response in Prometheus exposition format.
 *
 * @param {ProbeResult} r
 * @return {Response}
 */
export function buildResponse(r: ProbeResult): Response {
    const output = `probe_success ${r.probe_success ? 1 : 0}
probe_duration_seconds ${r.probe_duration_seconds}
probe_http_status_code ${r.probe_http_status_code}
probe_http_redirected ${r.probe_http_redirected ? 1 : 0}
probe_http_content_length ${r.probe_http_content_length}
    `
    return new Response(output)
}

function isEqualOrMatched(s: string) {
    return function (test: string | RegExp, index: number, array: Array<string | RegExp>): boolean {
        return test instanceof RegExp ? test.test(s) : test === s
    }
}

/**
 * Based on https://github.com/prometheus/blackbox_exporter/blob/master/CONFIGURATION.md#http_probe
 */
export interface HttpProbeConfig {
    //
    // Request options
    //

    // The HTTP method the probe will use. Default: 'GET'
    readonly method?: HttpMethod

    // The HTTP headers the probe will send. Default: {}
    readonly headers?: { [name: string]: string }

    // The body of the HTTP request the probe will send. Default: ''
    readonly body?: string

    // Whether or not the probe will follow any redirects. Default: false
    readonly no_follow_redirects?: boolean

    // Only allow probing of targets in this list. Default is empty, which means allow any target.
    readonly allowed_targets?: Array<string | RegExp>

    //
    // Response validation
    //

    // Accepted HTTP versions for this probe. Default to 2xx if not specified.
    readonly valid_status_codes?: Array<number> | HttpStatusCodeClass

    // Probe fails if response body matches any regex. Default: []
    readonly fail_if_matches_regexp?: Array<RegExp>

    // Probe fails if response body does not matches any regex. Default: []
    readonly fail_if_not_matches_regexp?: Array<RegExp>
}

export class HttpProbe {
    readonly method: HttpMethod
    readonly headers: { [name: string]: string }
    readonly body: string
    readonly noFollowRedirects: boolean
    readonly allowedTargets: Array<string | RegExp>
    readonly validStatusCodes: Array<number> | HttpStatusCodeClass
    readonly failIfMatchesRegexp: Array<RegExp>
    readonly failIfNotMatchesRegexp: Array<RegExp>

    constructor(config: HttpProbeConfig) {
        this.method = config.method || 'GET'
        this.headers = config.headers || {}
        this.body = config.body || ''
        this.noFollowRedirects = config.no_follow_redirects || false
        this.allowedTargets = config.allowed_targets || []
        this.validStatusCodes = config.valid_status_codes || HttpStatusCodeClass.Http_2xx
        this.failIfMatchesRegexp = config.fail_if_matches_regexp || []
        this.failIfNotMatchesRegexp = config.fail_if_not_matches_regexp || []
    }
}

export const enum HttpStatusCodeClass {
    Http_1xx,
    Http_2xx,
    Http_3xx,
    Http_4xx,
    Http_5xx
}

type HttpMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT'

export interface RequestParam {
    module: string,
    target: string
}

export interface ProbeResult {
    probe_success: boolean
    probe_duration_seconds?: number
    probe_http_status_code?: number
    probe_http_redirected?: boolean
    probe_http_content_length?: number
}

declare interface FetchEvent extends Event {
    request: Request

    respondWith(r: Promise<Response> | Response): Promise<Response>
}
