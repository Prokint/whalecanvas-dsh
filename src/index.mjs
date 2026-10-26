import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { createHostedProxy } from "./proxy.mjs";

export const name = "whalecanvas-dsh";
export const inject = ["webServer"];

// Keep this stable: existing links and the package name should not move when
// the repository is renamed.
export const appPath = "/plugins/whalecanvas-dsh/app";
const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
const pluginVersion = (await readFile(new URL("../VERSION", import.meta.url), "utf8").catch(() => "v0.1.0")).trim();
const appVersion = (await readFile(new URL("../app/version.json", import.meta.url), "utf8").catch(() => JSON.stringify({ version: pluginVersion })));
const version = (() => { try { return JSON.parse(appVersion).version || pluginVersion; } catch { return pluginVersion; } })();

const staticAssets = ["/icons", "/home", "/fonts", "/avatars"];
const rootAssets = ["/logo.svg", "/logo.png", "/config.js", "/favicon.ico"];

function redirect(res, location) {
    res.writeHead(307, { Location: location });
    res.end();
}

function notFound(res) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
}

function registerOptional(ctx, route) {
    try {
        ctx.effect(() => ctx.webServer.register(route));
        return true;
    } catch (error) {
        // A host route may already own a generic asset path (for example the
        // DSH shell's own /healthz). Do not fail the whole plugin for an
        // optional compatibility alias.
        console.warn(`[whalecanvas-dsh] 跳过已存在的路由 ${route.kind}:${route.path}`, error);
        return false;
    }
}

function serveFile(serve, req, res, pathname) {
    req.url = pathname;
    res.setHeader("X-Content-Type-Options", "nosniff");
    serve(req, res, () => notFound(res));
}

export async function apply(ctx) {
    const proxy = createHostedProxy();
    if (!existsSync(new URL("../app/index.html", import.meta.url))) {
        throw new Error("鲸绘 DSH 插件尚未打包：请先运行 node scripts/sync-app.mjs 生成 app/");
    }

    const serve = sirv(appDirectory, { single: true, etag: true, dev: true, maxAge: 0 });
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: appPath,
        handler(req, res) {
            if (!["GET", "HEAD"].includes(req.method || "GET")) return notFound(res);
            const url = new URL(req.url || "/", "http://localhost");
            if (url.pathname === appPath) return redirect(`${appPath}/${url.search}`);
            const pathname = url.pathname.slice(appPath.length) || "/";
            serveFile(serve, req, res, pathname || "/");
        },
    }));

    // The canvas build uses a few root-relative public assets (`/icons`,
    // `/home`, `/fonts`, `/logo.svg`). Keep those URLs at the DSH host root so
    // the same production bundle works without a second frontend build.
    for (const path of staticAssets) {
        registerOptional(ctx, {
            kind: "prefix", path,
            handler(req, res) {
                const url = new URL(req.url || "/", "http://localhost");
                serveFile(serve, req, res, url.pathname);
            },
        });
    }
    for (const path of rootAssets) {
        registerOptional(ctx, {
            kind: "exact", path,
            handler(req, res) { serveFile(serve, req, res, path); },
        });
    }

    registerOptional(ctx, {
        kind: "exact", path: "/healthz",
        handler(_req, res) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ ok: true, revision: version, plugin: pluginVersion }));
        },
    });
    registerOptional(ctx, {
        kind: "exact", path: "/release.json",
        handler(_req, res) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ version, builtAt: new Date().toISOString() }));
        },
    });

    // Same-origin API proxy. The browser logs into whaledraw.cn through this
    // route, so the session cookie lands on the DSH origin and the canvas can
    // keep using its normal `/api/hosted` requests.
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix", path: "/api/hosted",
        handler(req, res) { proxy(req, res); },
    }));
}
