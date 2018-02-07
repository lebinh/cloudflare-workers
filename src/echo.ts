/**
 * Echo-ing back request/response headers received by worker.
 */

/**
 * Cloudflare Worker entrypoint
 */
if (typeof addEventListener === 'function') {
    addEventListener('fetch', (e: Event): void => {
        // work around as strict typescript check doesn't allow e to be of type FetchEvent
        const fe = e as FetchEvent
        fe.respondWith(processRequest(fe.request))
    });
}

async function processRequest(r: Request): Promise<Response> {
    if (r.url.endsWith('/request/headers')) {
        return echoHeaders(r.headers)
    } else if (r.url.endsWith('/response/headers')) {
        const resp = await fetch(r)
        return echoHeaders(resp.headers)
    } else {
        return new Response('Bad Request', {status: 400, statusText: 'Bad Request'})
    }
}

function echoHeaders(h: Headers): Response {
    let output = ''
    for (let [name, value] of h.entries()) {
        output += `${name}: ${value}\n`
    }
    return new Response(output)
}

interface FetchEvent extends Event {
    request: Request;

    respondWith(r: Promise<Response> | Response): Promise<Response>;
}
