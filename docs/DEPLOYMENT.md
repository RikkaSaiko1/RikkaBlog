# 部署指南

本文档描述 RikkaBlog 当前代码的 Cloudflare Workers + D1 + R2 部署流程。

## 前置条件

- 已安装依赖：`pnpm install`（未装 pnpm 可执行 `npm install -g pnpm`；`package.json` 的 deploy 脚本内部使用 pnpm）
- 已登录 Wrangler：`npx wrangler login`（或使用 Cloudflare API Token）
- 已创建 GitHub OAuth App：
  - Homepage URL：`https://blog.926448.xyz`
  - Authorization callback URL：`https://blog.926448.xyz/auth/callback`

## 环境变量设计

- `wrangler.jsonc` 的 `vars` 只保留与部署结构相关的 `NODE_ENV`、`VITE_PORT`
- `APP_BASE_URL` 与所有密钥**不写入配置文件**：
  - 本地开发：放在 `.dev.vars`（已被 `.gitignore` 忽略，参考 `env.example`）
  - 线上环境：通过 `wrangler secret put --env production` 或 dashboard 的 Variables and Secrets 配置（Secret 不会被后续 deploy 覆盖）
- R2 / D1 属于资源绑定，Cloudflare 平台要求必须声明在 `wrangler.jsonc` 中，应用代码只使用绑定名（`DB` / `IMAGES` / `ASSETS`），不写死资源名

## 步骤 1：创建生产 D1 数据库

`wrangler.jsonc` 的 `env.production.d1_databases` 已指向 `luyblog_prod`。若该库尚未在账号中创建：

```bash
npx wrangler d1 create luyblog_prod
```

把输出中的真实 `database_id` 替换进 `wrangler.jsonc`。已存在则跳过。

## 步骤 2：创建 R2 存储桶

```bash
npx wrangler r2 bucket create rikka-blog-images
```

或在 dashboard → R2 Object Storage → Create bucket 创建，名称必须与 `wrangler.jsonc` 中 `bucket_name` 一致（当前为 `rikka-blog-images`）。

## 步骤 3：应用数据库迁移（建表）

```bash
npx wrangler d1 migrations apply DB --env production --remote
```

## 步骤 4：配置线上 Secrets

```bash
npx wrangler secret put APP_BASE_URL --env production       # 填 https://blog.926448.xyz
npx wrangler secret put GITHUB_CLIENT_ID --env production
npx wrangler secret put GITHUB_CLIENT_SECRET --env production
npx wrangler secret put CF_ACCOUNT_ID --env production      # 可选，后台 Cloudflare 用量面板
npx wrangler secret put CF_API_TOKEN --env production       # 可选，建议仅授予 Account Analytics Read 权限
npx wrangler secret put QWEATHER_KEY --env production       # 可选，天气接口
```

每条命令回车后粘贴对应值。`NODE_ENV`、`VITE_PORT` 已在 `wrangler.jsonc` 的 vars 中，无需重复设置。

## 步骤 5：本地验证

```bash
pnpm typecheck
pnpm test --run
pnpm build
```

## 步骤 6：构建并发布

```bash
pnpm deploy
```

`pnpm deploy` 会先执行 `generate:html`、`build:client`、`build:server`，再执行 `wrangler deploy --env production`。

若使用 npm，可手动等价执行：

```bash
npm run db:migrate:prod
npm run generate:html
npm run build:client
npm run build:server
npx wrangler deploy --env production
```

部署成功后输出 Worker 的 `*.workers.dev` 访问地址。

## 步骤 7：绑定自定义域名

1. dashboard → Workers & Pages → `luy-blog` → Settings → Domains & Routes → Add → Custom domain → 填 `blog.926448.xyz`
2. 前提：该域名已作为 Zone 加入当前 Cloudflare 账号且 DNS 由 Cloudflare 托管
3. 仅用 `*.workers.dev` 测试时可跳过本步

## 步骤 8：管理员提权

线上数据库是全新的，首次 GitHub 登录后默认是普通用户。先访问站点完成一次 GitHub 登录（在 `users` 表生成记录），再提权：

```bash
npx wrangler d1 execute DB --env production --remote --command "UPDATE users SET role='admin' WHERE username='<你的GitHub用户名>'"
```

之后访问 `/admin` 进入后台，在「站点配置」页面配置 AI 模型、API Key、站点文案等（这些属于运行时配置，存储在 D1，与环境变量无关）。

## 上线检查

- `/` 能返回生产 SSR 页面，`/assets/*` 静态资源正常
- `/rss.xml`、`/feed.xml`、`/sitemap.xml` 正常
- GitHub 登录完整走通
- 后台 `/admin` 可访问，粘贴图片能正常上传显示（验证 `IMAGES` R2 绑定生效）
- 未登录访问 `/api/admin/*`、`/api/ai/*` 会被拒绝（401/403）

## 数据说明

- 线上与本地（`.wrangler/state` 模拟 D1/R2）数据完全独立，本地测试内容不会上线
- 友链自动填充在生产环境启用严格 SSRF 防护（仅允许 80/443 端口的公网地址），抓取 localhost 会被拦截，属预期行为
