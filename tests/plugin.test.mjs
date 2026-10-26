import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { apply, appPath } from "../src/index.mjs";

function createContext() {
    const routes = new Map();
    return {
        routes,
        effect(fn) { fn(); },
        webServer: { register(route) { routes.set(`${route.kind}:${route.path}`, route); return () => {}; } },
    };
}

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

test("registers app, assets, health and hosted API routes", async (t) => {
    const cloud = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ proxy: true, path: req.url }));
    });
    const cloudPort = await listen(cloud);
    t.after(() => cloud.close());
    process.env.WHALECANVAS_CLOUD_ORIGIN = `http://127.0.0.1:${cloudPort}`;
    const ctx = createContext();
    await apply(ctx);
    assert.ok(ctx.routes.has(`prefix:${appPath}`));
    assert.ok(ctx.routes.has("prefix:/api/hosted"));
    assert.ok(ctx.routes.has("exact:/healthz"));
    assert.ok(![...ctx.routes.keys()].some((key) => key.includes("dsh-infinite-canvas")), "new plugin must not reuse the old app path");

    const local = http.createServer((req, res) => {
        const route = [...ctx.routes.values()].find((entry) => entry.kind === "prefix" && (req.url || "").startsWith(entry.path)) || [...ctx.routes.values()].find((entry) => entry.kind === "exact" && (req.url || "").split("?")[0] === entry.path);
        if (!route) { res.writeHead(404); res.end(); return; }
        route.handler(req, res);
    });
    const localPort = await listen(local);
    t.after(() => local.close());
    const base = `http://127.0.0.1:${localPort}`;
    const page = await fetch(`${base}${appPath}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /鲸绘/);
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const api = await fetch(`${base}/api/hosted/public`);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).path, "/api/hosted/public");
});

test("does not register an unauthenticated catch-all proxy", async () => {
    const ctx = createContext();
    await apply(ctx);
    assert.equal(ctx.routes.has("prefix:/"), false);
});
