# 部署上线指南

## 先明确部署模式

项目使用 Vue 3、Node.js 24、`node:sqlite` 和本地文件图片上传。账号、权限、通知、AI 记录与云同步都必须连接 Node 后端。

| 模式 | 可交付范围 | 是否需要 Node |
| --- | --- | --- |
| 完整全栈 | 登录、权限、同步、图片、AI 与全部页面 | 是 |
| 前端 CDN + 独立 API | 完整功能 | API 必须部署在 Node 域名 |
| 纯静态页面预览 | 只能检查界面，不能验收业务 | 否，但 API 功能不可用 |

> Node.js 必须为 24 或更高版本。Node 20 不支持项目使用的 `node:sqlite`。

## 推荐：Node 一体化部署

```bash
npm ci
npm run build
npm start
```

默认由 `3001` 同时提供 `/api`、图片上传与 `dist/`：

```text
http://127.0.0.1:3001/
http://127.0.0.1:3001/api/health
http://127.0.0.1:3001/api/uploads/images/<uuid>.png
```

## 当前线上部署：Railway

当前正式演示地址：

```text
https://campus-smart-dispatch-platform-production.up.railway.app/
```

部署方式：

- 根目录 `Dockerfile` 使用 Node.js 24 多阶段构建。
- `railway.json` 指定 Dockerfile 构建、`/api/health` 健康检查和数据卷挂载要求。
- Railway 连接 GitHub 仓库 `mzm995/campus-smart-dispatch-platform` 的 `main` 分支，提交后自动发布。
- 容器监听 `3001`，平台对外提供 HTTPS。
- 持久化数据卷挂载到 `/app/data`，数据库、上传目录和密钥均保存在该目录。

Railway 生产环境变量：

```dotenv
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_PATH=/app/data/campus-smart-dispatch-platform.sqlite
SECRETS_PATH=/app/data/.secrets-key
NOTIFICATION_RETENTION_DAYS=180
AUDIT_RETENTION_DAYS=365
```

如需自己的品牌域名，需要在 Railway 服务中添加 Custom Domain，并在域名服务商处按平台提供的目标配置 DNS。域名和 DNS 管理权限是绑定品牌域名的前提。

必须持久化的文件：

- `server/data/campus-smart-dispatch-platform.sqlite`
- `server/data/uploads/`
- `server/data/.secrets-key`（配置过 DeepSeek Key 后生成）

环境变量：

```dotenv
PORT=3001
HOST=0.0.0.0
DATABASE_PATH=server/data/campus-smart-dispatch-platform.sqlite
SECRETS_PATH=server/data/.secrets-key
CORS_ORIGINS=https://campus-smart-dispatch-platform.example.edu.cn
NODE_ENV=production
REGISTRATION_CODE=
NOTIFICATION_RETENTION_DAYS=180
AUDIT_RETENTION_DAYS=365
```

生产环境默认不信任任意 localhost Origin。仅本机跨端口联调时设置：

```dotenv
ALLOW_LOCAL_CORS=1
```

## 前端 CDN + 独立 API

如果前端放在 Netlify、Vercel、COS/OSS，后端仍必须运行在 Node 24 服务或容器中。

构建前端时指定 API：

```text
VITE_API_BASE_URL=https://api.example.edu.cn
```

API 服务配置：

```text
CORS_ORIGINS=https://www.example.edu.cn
NODE_ENV=production
```

前端只保存构建产物，不保存 SQLite 数据。Netlify/Vercel 配置已将 `/api/*` 明确设为 404，避免把 API 请求错误回退成 HTML。

## Nginx 反向代理

推荐让 Nginx 将同一域名的全部请求转给 Node：

```nginx
server {
    listen 443 ssl http2;
    server_name campus-smart-dispatch-platform.example.edu.cn;

    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Node 已负责 SPA 回退、API、图片和压缩静态资源，不需要再单独写 `try_files`。

## 数据库备份与恢复

创建一致性备份：

```bash
npm run backup
```

默认写入 `server/data/backups/campus-smart-dispatch-platform-<timestamp>.sqlite`。可通过 `DATABASE_PATH` 和 `BACKUP_DIR` 覆盖。

恢复时：

1. 停止 Node 服务。
2. 备份当前数据库和 `uploads/`。
3. 用目标备份替换 SQLite 文件。
4. 重新启动并访问 `/api/health`。

演示数据仅在空数据库自动写入，也可显式执行：

```bash
npm run seed
```

## 数据维护

服务启动后每小时自动执行：

- 删除过期 session。
- 按 `NOTIFICATION_RETENTION_DAYS` 清理旧通知，默认 180 天。
- 按 `AUDIT_RETENTION_DAYS` 清理旧审计，默认 365 天。

数据库结构迁移在事务中执行，失败会回滚。

## 发布检查

```bash
npm run test:backend
npm run build
```

构建会同时：

- 生成带 hash 的前端资源。
- 生成 gzip 与 brotli 预压缩文件。
- 检查 JS/CSS 与 Element Plus vendor 体积预算。
- 检查巨型单文件组件不允许继续无约束增长。

上线后检查：

- `/api/health` 返回 `status: ok`。
- `/login` 可以登录内置账号。
- `/system` 仅高级管理员可访问。
- 上传一张失物图片后，业务 JSON 中保存 `/api/uploads/images/...` URL，而不是 Base64 大字符串。
- 两个标签页同时修改同一资源时出现冲突选择弹窗。
- 断网后刷新页面，token 和本地业务缓存仍保留，并显示“使用本地缓存”提示。

## 纯静态预览（非当前线上入口）

必要时可以把带 `VITE_DEMO_API=1` 的 `dist/` 放到静态服务器，但只能作为界面预览：

- 使用浏览器内演示数据，不具备真实的多用户云端同步。
- 不能作为 SQLite、图片上传和正式账号系统的验收入口。
- 不要向验收人员提供该地址作为完整演示网址。
