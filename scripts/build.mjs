import { copyFile, access, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
try {
    await access(new URL("app/index.html", root));
} catch {
    throw new Error("缺少 app/index.html；请先运行 node scripts/sync-app.mjs <鲸绘 web/dist>");
}
const pluginVersion = (await readFile(new URL("VERSION", root), "utf8")).trim();
const appVersion = JSON.parse(await readFile(new URL("app/version.json", root), "utf8").catch(() => JSON.stringify({ version: pluginVersion }))).version || pluginVersion;
await writeFile(new URL("app/release.json", root), JSON.stringify({ version: appVersion }));
await copyFile(new URL("LICENSE", root), new URL("app/LICENSE", root));
console.log(`whalecanvas-dsh ${pluginVersion}（鲸绘 ${appVersion}）已打包，可运行 dsh plugin --profile desktop add link:<仓库目录>。`);
