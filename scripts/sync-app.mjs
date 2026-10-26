import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const source = resolve(process.argv[2] || process.env.WHALECANVAS_WEB_DIR || "../鲸绘 2/web");
const app = resolve(new URL("../app/", import.meta.url).pathname);

await access(`${source}/index.html`).catch(() => {
    throw new Error(`找不到鲸绘 web/dist：${source}\n用法：node scripts/sync-app.mjs <鲸绘 web/dist 或 web 源码目录>`);
});
const packageFile = await readFile(`${source}/package.json`, "utf8").catch(() => null);
if (packageFile) {
    const bun = process.env.BUN || "bun";
    await run(bun, ["run", "build"], {
        cwd: source,
        env: { ...process.env, VITE_HOSTED_MODE: "true", VITE_BASE: "/plugins/whalecanvas-dsh/app/" },
        maxBuffer: 20 * 1024 * 1024,
    });
}
const dist = packageFile ? `${source}/dist` : source;
await mkdir(app, { recursive: true });
await cp(dist, app, { recursive: true });
const versionFile = packageFile ? resolve(source, "../VERSION") : resolve(source, "../../VERSION");
const appVersion = process.env.WHALECANVAS_APP_VERSION || await readFile(versionFile, "utf8").catch(() => "v0.1.0");
await writeFile(`${app}/version.json`, JSON.stringify({ version: appVersion.trim() }));
await writeFile(`${app}/release.json`, JSON.stringify({ version: appVersion.trim() }));
console.log(`已同步鲸绘前端 ${appVersion.trim()} 到 ${app}`);
