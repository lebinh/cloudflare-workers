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
        const r = buildRequest(p, 'http://example.com')
        expect(r.url).to.equal('http://example.com')
    })
    it('should use default value for class property', () => {
        const p = new HttpProbe({})
        const r = buildRequest(p, 'http://example.com')
        expect(r.method).to.equal('GET')
    })
    it('should set the header specified in config', () => {
        const p = new HttpProbe({headers: {'foo': 'bar'}})
        const r = buildRequest(p, 'http://example.com')
        expect(r.url).to.equal('http://example.com')
        expect(r.headers.get('foo')).to.equal('bar')
    })
    it('should set the body specified in config', () => {
        const p = new HttpProbe({method: 'POST', body: 'foo'})
        const r = buildRequest(p, 'http://example.com')
        expect(r.url).to.equal('http://example.com')
        return expect(r.text()).to.eventually.equal('foo')
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
    it('should return 1 for successful probe', () => {
        const pr: ProbeResult = {
            probe_success: true
        }
        const r = buildResponse(pr)
        expect(r.body).to.not.equal(null)
        return expect(r.text()).to.eventually.contain('probe_success 1')
    })
    it('should return 0 for failed probe', () => {
        const pr: ProbeResult = {
            probe_success: false
        }
        const r = buildResponse(pr)
        expect(r.body).to.not.equal(null)
        return expect(r.text()).to.eventually.contain('probe_success 0')
    })
})