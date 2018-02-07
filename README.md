## Cloudflare Workers

[Cloudflare Workers](https://developers.cloudflare.com/workers/about/) scripts are Javascript programs
that can be run on Cloudflare's edge server, all [120 of them](https://www.cloudflare.com/network/).
They are modeled based on [Service Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
and is currently in open beta.

## Workers Zoo

This repo is just a collection of my workers when playing with it Cloudflare Workers:

* [http_prober](src/http_prober.ts) - An implementation of Prometheus's blackbox-exporter HTTP probe.

    ```
    $ curl 'thisisbinh.me/worker/http_prober?module=http_get_2xx&target=http://example.com/'
    probe_success 0
    probe_duration_seconds 0.694
    probe_http_status_code 200
    probe_http_redirected 1
    probe_http_content_length -1
    ```

This potentially can be used to monitor availability / performance of your origin server from Cloudflare point of view.  

* [proxy](src/proxy.ts) - Using worker as a HTTP proxy for other websites, e.g. https://thisisbinh.me/worker/proxy/github.com/lebinh

* [echo](src/echo.ts) - Debugging / testing script that just echo back the request/response from worker point of view.

    ```
    $ curl thisisbinh.me/worker/echo/request/headers
    accept: */*
    accept-encoding: gzip
    cf-connecting-ip: 139.59.112.58
    cf-force-miss-ts: 0
    cf-ipcountry: IN
    cf-ray: 3e94c829a18d17b0
    cf-visitor: {"scheme":"http"}
    connection: Keep-Alive
    host: thisisbinh.me
    user-agent: curl/7.52.1
    x-forwarded-proto: http
    x-real-ip: 139.59.112.58
    ```

## Playing with it

You will need TypeScript compiler to compile the sources. You can install it and other dependencies with
```
npm install
```

To build the Workers Javascript files from TypeScript sources:

```
$ make
```

To run test:

```
$ make test
```

To deploy **all** scripts to your Cloudflare account:

```
$ export CF_AUTH_EMAIL=your@email
$ export CF_AUTH_KEY=your_cloudflare_api_key
$ make deploy
```
