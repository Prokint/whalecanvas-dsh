import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createHostedProxy } from "../src/proxy.mjs";

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

test("proxies hosted API with cloud origin and cookie rewrite", async (t) => {
    const seen = {};
    const cloud = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            seen.method = req.method;
            seen.url = req.url;
            seen.origin = req.headers.origin;
            seen.host = req.headers.host;
            seen.cookie = req.headers.cookie;
            seen.body = Buffer.concat(chunks).toString();
            res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "canvas_session=abc; Path=/; Secure; HttpOnly; SameSite=Strict" });
            res.end(JSON.stringify({ ok: true }));
        });
    });
    const cloudPort = await listen(cloud);
    t.after(() => cloud.close());
    const proxy = createHostedProxy({ cloudOrigin: `http://127.0.0.1:${cloudPort}` });
    const local = http.createServer((req, res) => proxy(req, res));
    const localPort = await listen(local);
    t.after(() => local.close());

    const response = await fetch(`http://127.0.0.1:${localPort}/api/hosted/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://127.0.0.1:49334", "x-canvas-request": "1", cookie: "canvas_session=old" },
        body: JSON.stringify({ email: "a@example.com" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/api/hosted/auth/login");
    assert.equal(seen.origin, `http://127.0.0.1:${cloudPort}`);
    assert.equal(seen.host, `127.0.0.1:${cloudPort}`);
    assert.equal(seen.cookie, "canvas_session=old");
    assert.equal(seen.body, JSON.stringify({ email: "a@example.com" }));
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /canvas_session=abc/);
    assert.doesNotMatch(cookie, /Secure/i);
});

test("rejects paths outside the hosted API", async (t) => {
    const proxy = createHostedProxy({ cloudOrigin: "http://127.0.0.1:1" });
    const local = http.createServer((req, res) => proxy(req, res));
    const localPort = await listen(local);
    t.after(() => local.close());
    const response = await fetch(`http://127.0.0.1:${localPort}/not-api`);
    assert.equal(response.status, 404);
});
