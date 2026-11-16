# 可靠性与安全改造说明

## H6 云同步

- 版本冲突不再自动覆盖本地。页面会展示“保留本地 / 自动合并 / 使用云端”。
- 冲突发生前会把本地快照保存为独立 `conflictBackup`。
- 推送失败进入持久化重试队列；在线恢复、每 5 秒重试和手动重连时继续提交。
- `pagehide`、`visibilitychange` 和 `beforeunload` 会触发 `keepalive` 推送。
- 论坛回复、失物线索、拼单参与者、教室时间线按记录 ID 取并集。

## H7 增量同步与图片

- 云同步改为 `/api/shared/:resource/changes`，只提交新增、更新、删除和顺序变化。
- 服务端仍会执行原有字段级权限校验，再写回完整快照。
- 单业务文档上限为 4MB，超过返回 `SHARED_DOCUMENT_TOO_LARGE`。
- 图片使用 `/api/uploads/images` 独立上传，读取时返回 `/api/uploads/images/<uuid>` URL，业务 JSON 不再保存新 Base64 图片。
- localStorage 写入失败时转存 IndexedDB，并触发全局用户提示。

## H8 会话恢复

- 只有明确 `401` 才会清除认证状态。
- 网络错误和 `5xx` 保留 token、用户缓存和业务缓存。
- 页面显示“后端连接暂时中断，正在使用本地缓存”，并提供重新连接按钮。
- 业务缓存只会在主动退出登录和显式重置时清理。

## H9 部署

- Netlify Node 版本改为 24；Netlify、Vercel 和 `_redirects` 均禁止把 `/api/*` 回退成 HTML。
- 前端支持 `VITE_API_BASE_URL`，可连接独立 Node API。
- README 与部署文档明确区分完整全栈、前端 CDN + 独立 API、纯静态预览。

## M1 账号安全

- 登录统一返回“账号或密码错误”，失败增加随机延迟。
- 新密码至少 8 位，并拒绝常见弱口令和重复字符。
- 可选 `REGISTRATION_CODE` 邀请码；有效姓名不可重复。
- 服务端归属校验只接受用户 ID，不再按姓名放行。

## M5 巨型组件

完整拆分多个 1500–2500 行页面会带来较高样式和交互回归风险，因此本轮采用渐进方案：

- 建立文件行数门禁，阻止现有巨型组件继续增长。
- 新增业务逻辑优先进入 Pinia store、composable 或独立组件。
- 下一阶段优先拆分 `LostFoundView` 的详情弹层和 `SystemView` 的分区内容。

本轮已将失物招领右侧流程、成功案例、FAQ 与公告拆为独立组件，并在登录页新增五角色快速入口和全局评审向导。

## M6 前端体积

本轮不直接切换到全量按需组件，避免 Element Plus 样式遗漏造成现场回归。已实施：

- 构建生成 gzip 与 brotli 预压缩资源，Node 静态服务按 `Accept-Encoding` 返回。
- 降低 Vite 警告阈值并增加实际体积预算检查。
- 当前 Element Plus vendor 体积门禁为 1MB（未压缩）。

## M8 数据库维护

- schema 迁移在 `BEGIN IMMEDIATE` 事务中执行，失败自动回滚。
- 演示种子只在空库自动写入，也可通过 `npm run seed` 显式执行。
- 新增 `npm run backup`，使用 SQLite `VACUUM INTO` 生成一致性备份。
- 服务启动后每小时清理过期 session、旧通知和旧审计，保留期可配置。

## L2 / L3

- 生产环境默认只允许显式 `CORS_ORIGINS`。
- 本机任意端口跨域仅在开发环境或 `ALLOW_LOCAL_CORS=1` 时放行。
- 过期 session 不再只在启动时清理。

## 演示运维

- 系统控制台提供高级管理员专属“重置共享演示数据”，保留账号和配置，重置共享业务、通知、AI 记录与审计。
- 提供 Dockerfile 与 Compose，固定 Node 24 并持久化 SQLite、图片和密钥目录。
