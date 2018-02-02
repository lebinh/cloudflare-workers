
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
        const fe = e as FetchEvent
        fe.respondWith(processRequest(fe.request))
    });
}

function processRequest(r: Request): Response | Promise<Response> {
    if (r.method !== 'GET') {
        return new Response('Sorry, this only accept GET method', {status: 400})
    }

    const [params, err] = parseParams(r)
    if (params === null) {
        // err must be non-null if params is null
        return new Response(`error: ${err!.message}`, {status: 400})
    }
    if (!modules.hasOwnProperty(params.module)) {
        return new Response(`Unknown module: ${params.module}`, {status: 400})
    }

    const module = modules[params.module]
    return doProbe(module, params.target)
}

/**
 * Parse request params for module and target.
 *
 * @param r the Request to parse
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
    };
    return [result, null]
}

async function doProbe(config: HttpProbeConfig, target: string): Promise<Response> {
    const probe = new HttpProbe(config)
    const req = buildRequest(probe, target)

    // performance.now() is not available in CF workers
    const before = Date.now();
    const resp = await fetch(req);
    const after = Date.now();

    const success = await validateResponse(probe, resp);
    const contentLength = parseInt(resp.headers.get('content-length') || '-1');
    const probeResult: ProbeResult = {
        probe_success: success,
        probe_duration_seconds: (after - before) / 1000,
        probe_http_status_code: resp.status,
        probe_http_redirected: resp.redirected,
        probe_http_content_length: contentLength,
    };
    return buildResponse(probeResult);
}

export function buildRequest(probe: HttpProbe, target: string): Request {
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
    return new Request(target, options);
}

export async function validateResponse(probe: HttpProbe, resp: Response): Promise<boolean> {
    const validStatus = validateResponseStatus(resp.status, probe.validStatusCodes)
    if (!validStatus) {
        return false
    }

    const bodyText = await resp.text()
    return validateResponseBody(bodyText, probe);
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
    return true;
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

export function buildResponse(r: ProbeResult): Response {
    const output = `probe_success ${r.probe_success ? 1 : 0}
probe_duration_seconds ${r.probe_duration_seconds}
probe_http_status_code ${r.probe_http_status_code}
probe_http_redirected ${r.probe_http_redirected ? 1 : 0}
probe_http_content_length ${r.probe_http_content_length}
    `
    return new Response(output)
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
    readonly validStatusCodes: Array<number> | HttpStatusCodeClass
    readonly failIfMatchesRegexp: Array<RegExp>
    readonly failIfNotMatchesRegexp: Array<RegExp>

    constructor(config: HttpProbeConfig) {
        this.method = config.method || 'GET'
        this.headers = config.headers || {}
        this.body = config.body || ''
        this.noFollowRedirects = config.no_follow_redirects || false
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
    request: Request;
    respondWith(r: Promise<Response> | Response): Promise<Response>;
}
