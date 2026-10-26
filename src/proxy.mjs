import http from "node:http";
import https from "node:https";

const HOP_BY_HOP = new Set([
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
]);

function cleanHeaders(headers) {
    const output = {};
    for (const [name, value] of Object.entries(headers || {})) {
        if (!HOP_BY_HOP.has(name.toLowerCase()) && value !== undefined) output[name] = value;
    }
    return output;
}

function rewriteCookies(value, secure) {
    const cookies = Array.isArray(value) ? value : [value];
    return cookies.filter(Boolean).map((cookie) => {
        // The DSH web server is a local HTTP origin. A Secure cookie produced by
        // the production API would never be sent back, so only keep Secure when
        // the plugin is actually behind HTTPS.
        if (!secure) return String(cookie).replace(/;\s*Secure/gi, "");
        return String(cookie);
    });
}

/**
 * Proxy the hosted canvas API to the cloud server.
 *
 * Only the two fixed prefixes are accepted. The upstream origin is never
 * derived from the incoming request, so this cannot be used as an open proxy.
 */
export function createHostedProxy({ cloudOrigin = process.env.WHALECANVAS_CLOUD_ORIGIN || "https://whaledraw.cn", request = null, timeoutMs = 120_000 } = {}) {
    const origin = new URL(cloudOrigin);
    if (!["http:", "https:"].includes(origin.protocol)) throw new Error("WHALECANVAS_CLOUD_ORIGIN 必须是 HTTP(S) 地址");
    const transport = origin.protocol === "https:" ? https : http;
    const forward = request || ((options, callback) => transport.request(options, callback));

    return function hostedProxy(req, res) {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        if (!pathname.startsWith("/api/hosted") && pathname !== "/healthz") {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
        }
        const target = new URL(`${origin.origin}${req.url || "/"}`);
        const secure = Boolean(req.socket?.encrypted);
        const headers = cleanHeaders(req.headers);
        headers.host = origin.host;
        // The hosted API enforces Origin + X-Canvas-Request on writes. The DSH
        // page has a different origin, so present it as the canonical cloud
        // origin; the local plugin remains the only caller of this proxy.
        headers.origin = origin.origin;
        headers.referer = `${origin.origin}/`;
        headers["x-forwarded-host"] = req.headers.host || "";
        headers["x-forwarded-proto"] = secure ? "https" : "http";
        if (req.headers["content-length"] !== undefined) headers["content-length"] = req.headers["content-length"];

        const upstream = forward({
            protocol: origin.protocol,
            hostname: origin.hostname,
            port: origin.port || undefined,
            method: req.method,
            path: `${target.pathname}${target.search}`,
            headers,
            timeout: timeoutMs,
        }, (response) => {
            const responseHeaders = cleanHeaders(response.headers);
            if (response.headers["set-cookie"]) responseHeaders["set-cookie"] = rewriteCookies(response.headers["set-cookie"], secure);
            if (response.headers.location) {
                try {
                    const location = new URL(response.headers.location, origin);
                    if (location.origin === origin.origin) responseHeaders.location = `${location.pathname}${location.search}${location.hash}`;
                } catch { /* Keep an opaque redirect as-is. */ }
            }
            res.writeHead(response.statusCode || 502, responseHeaders);
            response.pipe(res);
        });
        upstream.on("timeout", () => upstream.destroy(new Error("云端请求超时")));
        upstream.on("error", (error) => {
            if (res.headersSent) { res.destroy(error); return; }
            res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ error: "暂时无法连接鲸绘云端", detail: error instanceof Error ? error.message : String(error) }));
        });
        if (req.method === "GET" || req.method === "HEAD" || !req.readable) upstream.end();
        else req.pipe(upstream);
    };
}
