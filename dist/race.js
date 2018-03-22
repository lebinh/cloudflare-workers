"use strict";
/**
 * Racing Proxy: return the fastest response from given list of origins.
 *
 * The main idea is that real-world latency depends on a lot on the exact time and location.
 * So the best strategy to optimize for latency would be to try several origins,
 * all at the same time and only return the first received response.
 *
 * WARNING: this will also return the first error or non 200 response as well. So it is
 * not a good-idea(TM), to use this for any kind of high-availability or redundant setup.
 */
/**
 * Cloudflare Worker entrypoint
 */
if (typeof addEventListener === 'function') {
    addEventListener('fetch', (e) => {
        // work around as strict typescript check doesn't allow e to be of type FetchEvent
        const fe = e;
        const url = new URL(fe.request.url);
        const origins = url.searchParams.getAll('o');
        const responses = origins.map(o => fetch(o));
        fe.respondWith(Promise.race(responses));
    });
}
