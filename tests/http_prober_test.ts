import 'mocha'
import * as chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import {Headers, Request, Response} from 'whatwg-fetch'
import {URL} from 'url'
import {
    buildRequest,
    buildResponse,
    HttpProbe,
    HttpStatusCodeClass,
    parseParams,
    parseRayId,
    ProbeResult,
    validateResponse,
} from '../src/http_prober';

chai.use(chaiAsPromised)
const expect = chai.expect

declare var global: object
Object.assign(global, {Request, Response, Headers, URL})

describe('parseParams function', () => {
    it('should return correct module and target params', () => {
        const r = new Request('https://example.com?module=foo&target=bar')
        const [params, err] = parseParams(r)
        expect(err).to.equal(null)
        expect(params!.module).to.equal('foo')
        expect(params!.target).to.equal('bar')
    })
    it('should return error if module param is missing', () => {
        const r = new Request('https://example.com?target=bar')
        const [params, err] = parseParams(r)
        expect(params).to.equal(null)
        expect(err).to.not.equal(null)
        expect(err!.message).to.contain('module parameter is missing')
    })
    it('should return error if target param is missing', () => {
        const r = new Request('https://example.com?module=foo')
        const [params, err] = parseParams(r)
        expect(params).to.equal(null)
        expect(err).to.not.equal(null)
        expect(err!.message).to.contain('target parameter is missing')
    })
})

describe('buildRequest function', () => {
    it('should use the target param as URL', () => {
        const p = new HttpProbe({})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.equal(null)
        expect(r).to.not.equal(null)
        expect(r!.url).to.equal('http://example.com')
    })
    it('should return error if target param is not an URL', () => {
        const p = new HttpProbe({})
        const [r, err] = buildRequest(p, 'example.com')
        expect(r).to.equal(null)
        expect(err).to.not.equal(null)
        expect(err!.message).to.contain('target must start with either http:// or https://')
    })
    it('should use default value for class property', () => {
        const p = new HttpProbe({})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.equal(null)
        expect(r).to.not.equal(null)
        expect(r!.method).to.equal('GET')
    })
    it('should set the header specified in config', () => {
        const p = new HttpProbe({headers: {'foo': 'bar'}})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.equal(null)
        expect(r).to.not.equal(null)
        expect(r!.url).to.equal('http://example.com')
        expect(r!.headers.get('foo')).to.equal('bar')
    })
    it('should set the body specified in config', () => {
        const p = new HttpProbe({method: 'POST', body: 'foo'})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.equal(null)
        expect(r).to.not.equal(null)
        expect(r!.url).to.equal('http://example.com')
        return expect(r!.text()).to.eventually.equal('foo')
    })
    it('should return error if body is set for GET request', () => {
        const p = new HttpProbe({method: 'GET', body: 'foo'})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.not.equal(null)
        expect(r).to.equal(null)
        expect(err!.message).to.contain('body is not allowed')
    })
    it('should return error if target is not allowed', () => {
        const p = new HttpProbe({method: 'GET', allowed_targets: ['foo']})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.not.equal(null)
        expect(r).to.equal(null)
        expect(err!.message).to.contain('target is not allowed in probe config')
    })
    it('should also use regexp for checking allowed targets', () => {
        const p = new HttpProbe({method: 'GET', allowed_targets: [/https:\/\/.+/]})
        const [r, err] = buildRequest(p, 'https://example.com')
        expect(err).to.equal(null)
        expect(r).to.not.equal(null)
    })
    it('should return error if target is not allowed with regexp', () => {
        const p = new HttpProbe({method: 'GET', allowed_targets: [/https:\/\/.+/]})
        const [r, err] = buildRequest(p, 'http://example.com')
        expect(err).to.not.equal(null)
        expect(r).to.equal(null)
        expect(err!.message).to.contain('target is not allowed in probe config')
    })
})

describe('validateResponse function', () => {
    it('should return true for valid status code', () => {
        const p = new HttpProbe({valid_status_codes: [200]})
        const r = new Response('', {status: 200})
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(true)
    })
    it('should return false for invalid status code', () => {
        const p = new HttpProbe({valid_status_codes: [200]})
        const r = new Response('', {status: 400})
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(false)
    })
    it('should return true for valid status class', () => {
        const p = new HttpProbe({})
        const r = new Response('', {status: 201})
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(true)
    })
    it('should return false for invalid status class', () => {
        const p = new HttpProbe({
            valid_status_codes: HttpStatusCodeClass.Http_2xx
        })
        const r = new Response('', {status: 301})
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(false)
    })
    it('should return false for matching fail_if_matches_regexp', () => {
        const p = new HttpProbe({
            fail_if_matches_regexp: [/error/]
        })
        const r = new Response('error')
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(false)
    })
    it('should return true for non-matching fail_if_matches_regexp', () => {
        const p = new HttpProbe({
            fail_if_matches_regexp: [/error/]
        })
        const r = new Response('ok')
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(true)
    })
    it('should return false for non-matching fail_if_not_matches_regexp', () => {
        const p = new HttpProbe({
            fail_if_not_matches_regexp: [/ok/]
        })
        const r = new Response('error')
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(false)
    })
    it('should return true for matching fail_if_not_matches_regexp', () => {
        const p = new HttpProbe({
            fail_if_not_matches_regexp: [/ok/]
        })
        const r = new Response('ok')
        const valid = validateResponse(p, r)
        return expect(valid).to.eventually.equal(true)
    })
})

describe('buildResponse function', () => {
    function createProbeResult(success: boolean = true): ProbeResult {
        return {
            cf_pop: 'unknown',
            client_country: 'unknown',
            probe_success: success,
            probe_duration_seconds: 1,
            probe_http_status_code: 200,
            probe_http_redirected: false,
            probe_http_content_length: 0,
        }
    }

    it('should return 1 for successful probe', () => {
        const r = buildResponse(createProbeResult())
        return expect(r.text()).to.eventually.match(/probe_success.* 1/)
    })
    it('should return 0 for failed probe', () => {
        const r = buildResponse(createProbeResult(false))
        return expect(r.text()).to.eventually.match(/probe_success.* 0/)
    })
    it('should return all metrics in response', () => {
        const r = buildResponse(createProbeResult())
        return expect(r.text()).to.eventually.contain('probe_success')
            .and.contain('probe_duration_seconds')
            .and.contain('probe_http_status_code')
            .and.contain('probe_http_redirected')
            .and.contain('probe_http_content_length')
    })
})

describe('parseRayId function', () => {
    it('should return the pop id and ray id from rayId-popId input', () => {
        const r = parseRayId('foo-bar')
        expect(r.rayId).to.equal('foo')
        expect(r.popId).to.equal('bar')
    })
    it('should only split on the first dash', () => {
        const r = parseRayId('foo-bar-blah')
        expect(r.rayId).to.equal('foo')
        expect(r.popId).to.equal('bar-blah')
    })
    it('should return the whole thing as ray id if there is no dash', () => {
        const r = parseRayId('foobar')
        expect(r.rayId).to.equal('foobar')
        expect(r.popId).to.equal('unknown')
    })
})
