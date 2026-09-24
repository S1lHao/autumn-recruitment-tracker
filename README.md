# 秋招协作台

仅受邀成员可见的秋招记录工具。每位成员维护独立的投递列表；同一工作区成员可查看彼此记录，但只有记录所有者或仍在有效期内的临时授权成员可以新增、修改记录，删除始终仅限所有者。Supabase RLS 是最终权限边界。

## 1. 前置条件

- Node.js 20 或更高版本，以及 npm
- Docker Desktop（本地 Supabase 数据库需要）
- Supabase CLI（项目已包含 npm 开发依赖，也可通过 `npx supabase` 使用）
- 一个 Supabase 账号和一个新建的生产项目
- 一个 Vercel 账号

## 2. 本地启动

安装依赖并准备环境文件：

```bash
npm install
cp .env.example .env.local
```

启动完全本地的 Supabase，查看本地 API URL、anon key 和 service-role key：

```bash
npx supabase start
npx supabase status
```

把本地值写入 `.env.local`。本项目实际读取且只读取以下五个环境变量：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
INITIAL_ADMIN_EMAIL=owner@example.com
```

应用迁移并启动开发服务器：

```bash
npx supabase db reset
npm run dev -- --hostname 127.0.0.1 --port 3000
```

访问 `http://127.0.0.1:3000`。本项目将该 origin 作为唯一规范的本地地址；不要改用 `localhost`、`::1` 或 HTTPS。停止本地 Supabase 可运行 `npx supabase stop`。

## 3. 创建首位管理员

首次初始化必须使用一个尚未创建工作区的空数据库。把管理员邮箱规范化后写入 `INITIAL_ADMIN_EMAIL`，重启 Next.js，然后在登录页输入同一邮箱并请求首次登录链接。本地邮件可在 Supabase CLI 输出的 Inbucket 地址中打开；点击链接后，回调会验证邮箱并原子创建“秋招工作台”和首位管理员成员关系。

首个工作区已经存在后，`INITIAL_ADMIN_EMAIL` 不会创建第二个工作区。不要把普通成员邮箱轮换到这个变量来绕过邀请流程。

## 4. 邀请成员

管理员登录后，在“邀请成员”区域输入同伴邮箱并发送邀请。系统先创建待处理邀请，再通过 Supabase Auth 发送邀请邮件；收件人必须点击该邮件中的链接完成验证和入组。邀请默认七天有效，未受邀邮箱无法请求登录链接。普通成员不能邀请其他人。

## 5. 测试与发布前检查

```bash
npm test
npm run lint
npx tsc --noEmit
npm run test:db
npm run test:e2e
npm run build
```

- `npm test`：单元与组件测试。
- `npm run test:db`：pgTAP/RLS 数据库测试；需要 Docker 正在运行且已执行 `npx supabase start`。
- `npm run test:e2e`：关键浏览器流程；需要本地 Supabase 已启动、迁移已应用，五个环境变量与上面的 canonical 本地值一致，并需先安装浏览器 `npx playwright install chromium`。运行前先停止任何占用 `127.0.0.1:3000` 的开发服务器；此命令会自行启动一个专用 Next.js dev server，测试结束后自动关闭，且绝不会复用已经运行的服务器。E2E 安全门只接受 Supabase `http://127.0.0.1:54321` 和站点 `http://127.0.0.1:3000`，因此不会用 service-role 凭据改写远端项目。测试创建唯一隔离数据和真实 Auth 会话，并在结束或失败时清理。
- `npm run build`：Next.js 生产构建。

数据库或浏览器运行时缺失时，先补齐前置条件；不要把失败当作通过，也不要把 E2E 环境变量改成线上值。

## 6. Supabase 生产配置

1. 登录 CLI、关联新建的生产项目并推送迁移：

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `db push` 会改动已关联的远端数据库，执行前务必核对 project ref。完成后确认所有产品表均保持 RLS enabled，且策略和函数创建成功。
2. 在 Auth URL Configuration 中把 Site URL 设为正式 Vercel 域名，并在 Redirect URLs allowlist 中至少加入：
   - `http://127.0.0.1:3000/auth/callback`
   - `https://<your-vercel-domain>/auth/callback`
3. 正式协作前配置自有 SMTP。Supabase 默认邮件服务有发送限制，不适合作为生产邀请与登录邮件通道。
4. 从 Supabase 项目设置取得项目 URL、anon key 和 service-role key，分别映射到下面五个变量。`NEXT_PUBLIC_SITE_URL` 必须是用户实际访问的 HTTPS origin；`INITIAL_ADMIN_EMAIL` 必须是首位管理员的准确邮箱。

## 7. Vercel 部署

1. 把仓库推送到 Git 托管平台，在 Vercel 中选择 **Import Project**；Framework Preset 使用 Next.js，构建命令保持 `npm run build`。
2. 在 Vercel Project Settings → Environment Variables 为 Production（按需也为 Preview）添加全部五项：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `INITIAL_ADMIN_EMAIL`
3. 首次部署后取得稳定正式域名，把 `NEXT_PUBLIC_SITE_URL` 更新为该 HTTPS origin 并重新部署。
4. 回到 Supabase，把该正式域名设为 Site URL，并把精确的 `/auth/callback` 地址加入 Redirect URLs allowlist。若启用 Vercel 自定义域名，也逐一加入对应回调地址。
5. 按“创建首位管理员”流程完成一次初始化，再由管理员邀请同伴。

不要让生产部署依赖 Preview 的临时域名；如果需要 Preview 登录，应显式维护受控的 Preview 回调规则。

## 8. 安全说明

- `SUPABASE_SERVICE_ROLE_KEY` 只能存在于本地服务器环境和 Vercel 服务端环境，绝不能提交到 Git、打印到日志、放进 `NEXT_PUBLIC_*` 变量或发送给浏览器。
- anon key 可以公开，但它不替代授权；必须始终保持 RLS 启用，并在变更迁移后重新运行数据库授权测试。
- `.env.local` 已被 Git 忽略。发生密钥泄露时立即在 Supabase 轮换对应密钥，并更新 Vercel 环境变量。
- 只向可信邮箱发送邀请；成员访问、编辑和授权仍由会话、工作区成员关系、有效授权及 RLS 共同校验。
