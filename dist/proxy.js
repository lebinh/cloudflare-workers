"use strict";
/**
 * HTTP Proxy to arbitrary URL with Cloudflare Worker.
 */
/**
 * Cloudflare Worker entrypoint
 */
if (typeof addEventListener === 'function') {
    addEventListener('fetch', (e) => {
        // work around as strict typescript check doesn't allow e to be of type FetchEvent
        const fe = e;
        fe.respondWith(proxyRequest(fe.request));
    });
}
async function proxyRequest(r) {
    const url = new URL(r.url);
    const prefix = '/worker/proxy/';
    if (url.pathname.startsWith(prefix)) {
        const remainingUrl = url.pathname.replace(new RegExp('^' + prefix), '');
        let targetUrl = decodeURIComponent(remainingUrl);
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = url.protocol + '//' + targetUrl;
        }
        return fetch(targetUrl);
    }
    else {
        return new Response('Bad Request', { status: 400, statusText: 'Bad Request' });
    }
}
