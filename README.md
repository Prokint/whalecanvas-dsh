<p align="center">
  <img src="app/logo.svg" width="88" alt="鲸绘" />
</p>

<h1 align="center">whalecanvas-dsh</h1>

<p align="center">
  在 DeepSeek Harness 中内嵌鲸绘画布：账号、数据、模型和积分走 <a href="https://whaledraw.cn">whaledraw.cn</a>。
</p>

---

## 它是什么

这是一个新的 DSH 插件仓库，不是第二个鲸绘前端。

```text
DSH
  ├─ 插件壳
  ├─ 内嵌鲸绘画布（当前生产 web 构建）
  └─ /api/hosted 同源代理
          ↓
      whaledraw.cn
      ├─ 账号登录
      ├─ 云端画布 / 素材 / 任务
      ├─ PostgreSQL
      ├─ 模型与上游路由
      └─ 积分计费
```

插件只负责：

- 在 DSH 中提供画布页面
- 把 `/api/hosted` 代理到鲸绘云端
- 让登录 Cookie 落在 DSH 同源
- 处理静态资源、版本和健康检查

账号、数据、模型和积分都不在本仓库实现。

## 当前状态

MVP 已可运行：

- DSH 内嵌鲸绘画布
- 鲸绘账号登录
- 云端画布、素材、生成任务
- 云端模型与积分
- 同源 API 代理和 Cookie 转发
- 静态资源兼容（`/icons`、`/home`、`/fonts`、`/logo.svg`）

后续：

- DSH 原生侧栏/右侧面板注册
- DSH 账号和设备码登录
- MCP 工具注册
- 插件安装、更新、回滚
- 多窗口画布状态隔离

## 安装

### 1. 准备

需要：

- DSH 桌面版或 Web 版
- Node.js >= 22.19
- 鲸绘账号（https://whaledraw.cn）

### 2. 安装依赖

```bash
npm install
# 或
bun install
```

### 3. 生成 app

从鲸绘仓库同步当前前端：

```bash
# 指向鲸绘 web 源码目录，会使用 Vite 重新构建
node scripts/sync-app.mjs ../鲸绘\ 2/web

# 或者直接指向已构建的 dist
node scripts/sync-app.mjs ../鲸绘\ 2/web/dist
```

源码构建需要设置 `BUN`：

```bash
BUN=/path/to/bun node scripts/sync-app.mjs ../鲸绘\ 2/web
```

默认云端：

```text
https://whaledraw.cn
```

插件运行时可用 `WHALECANVAS_CLOUD_ORIGIN` 覆盖。

### 4. 安装到 DSH

```bash
dsh plugin --profile desktop add "link:$PWD"
```

安装后重启 DSH，从侧栏或插件入口打开鲸绘。

也可以打包：

```bash
npm pack
# 生成 whalecanvas-dsh-0.1.0.tgz
dsh plugin --profile desktop add "file:$PWD/whalecanvas-dsh-0.1.0.tgz"
```

## 登录与 Cookie

画布通过同源 `/api/hosted` 登录，代理会：

- 把请求转发到 `WHALECANVAS_CLOUD_ORIGIN`
- 把 `Origin` 改写为云端 Origin，通过服务端写请求校验
- 转发 Cookie 和响应 `Set-Cookie`
- 本地 HTTP 环境下去掉 `Secure`，让 DSH 的 `127.0.0.1` 页面可以保存会话

Cookie 只落在 DSH 本地来源，不会暴露云端 Cookie 给其他站点。

## 开发

```bash
npm test
```

测试覆盖：

- `/api/hosted` 路径白名单
- Origin/Cookie 转发
- `Secure` Cookie 本地降级
- 插件静态页面、资源、health、API 路由注册

## 版本

- 仓库版本：`VERSION`
- 画布版本：`app/version.json`（来自鲸绘构建）
- 插件更新和画布更新分离

## 安全边界

- 代理只允许 `/api/hosted` 和 `/healthz`，不是开放代理
- 上游 Origin 固定，不根据请求 Host 动态拼接
- 不保存账号密码和模型 Key
- 不在插件里存放鲸绘后端密钥
- 生产模型 Key 仍只在鲸绘服务端加密保存

## License

MIT。画布 UI 来自鲸绘 / Infinite Canvas 生态，账号、云端和计费实现仍在鲸绘主仓库。
