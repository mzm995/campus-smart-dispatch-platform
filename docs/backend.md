# 校园智能调度平台后端与数据库

本项目使用 Node.js 内置 `http` 与 `node:sqlite`，不新增后端 npm 依赖。前端与 API 在开发时分别运行于 `5173` 和 `3001`，Vite 将 `/api` 代理到后端；生产模式由同一个 Node 进程同时提供 API 和 `dist/`。

## 启动

```bash
npm install
npm run dev
```

- 可选：复制 `.env.example` 为 `.env`，调整端口、监听地址、数据库路径或跨域来源。
- 前端：http://localhost:5173
- 后端健康检查：http://localhost:3001/api/health
- Windows 可直接运行 `启动校园智能调度平台.bat`
- 生产模式：`npm run build` 后执行 `npm start`
- 接口回归：`npm run test:backend`

数据库默认位于 `server/data/campus-smart-dispatch-platform.sqlite`，首次启动自动建表并写入内置账号与默认配置。可使用 `DATABASE_PATH` 指定其它 SQLite 文件。

API Key 加密所用随机主密钥默认位于数据库同目录的 `.secrets-key`，可使用 `SECRETS_PATH` 指定其它位置。该文件必须与数据库一起安全备份，不能提交到 Git。

## 角色与权限

| role_key | 显示名称 | 等级 | 可分配 | 说明 |
| --- | --- | ---: | --- | --- |
| `student` | 学生 | 10 | 是 | 自定义账号默认权限 |
| `monitor` | 班委 | 20 | 是 | 班级事务演示身份 |
| `forum_moderator` | 论坛坛主 | 30 | 是 | 校园论坛全部权限，可删除任意帖子 |
| `admin` | 管理员 | 80 | 是 | 内容与审批管理；不再拥有系统控制台 |
| `super_admin` | 高级管理员 | 100 | 否 | 可调整其它账号状态与权限 |

权限边界：

- 高级管理员不能修改自己的角色或状态。
- 高级管理员账号不能被其它接口编辑。
- 角色分配只接受 `assignable = 1` 的角色。
- 可分配角色的最高等级固定为 `80`，因此不能通过 API 创建新的高级管理员。
- 账号被停用后，该用户所有会话立即删除，后续登录返回 `ACCOUNT_DISABLED`。
- 前端路由守卫只负责体验，后端每个受保护接口都会重新校验会话与角色。
- 五类角色的完整能力矩阵与数据范围见 [role-permissions.md](role-permissions.md)。

## 自定义演示账号

登录页左侧填写姓名和自设密码，提交后系统创建人物并固定显示在右侧人物列表：

- 姓名为 1 至 10 个字符。
- 密码由创建者自行设置，长度为 6 至 32 个字符，创建时需要二次确认。
- 学号由后端自动生成，用户不能手填。默认起始学号为 `21040001`。
- 无释放号码时按 `21040001、21040002、21040003…` 递增。
- 有释放号码时，按释放时间从早到晚优先继承，避免打乱后续新号段。
- 新人物创建后不自动登录，会立即出现在登录页右侧；点击人物卡片进入系统。
- 所有可用账号都由 `GET /api/auth/demo-accounts` 从数据库读取，不再依赖前端临时数据。
- 所有账号登录都必须校验密码。内置演示账号统一使用 `123456`，且不允许修改；自建人物使用创建时设置的密码，并可在个人资料页修改。
- 密码使用随机盐 + `scrypt` 哈希保存，数据库不保存明文密码。

## 学号生成与回收

编号逻辑由 `student_number_sequence` 与 `student_numbers` 两张表共同完成：

1. `student_number_sequence` 保存起始号与下一新号游标。
2. `student_numbers` 保存每个自动生成学号的当前状态、占用账号、释放时间和复用次数。
3. 创建人物时，先查询 `available` 号码并按 `released_at` 升序取最早释放的一个。
4. 没有可复用号码时，从序列游标生成新号，生成成功后再推进游标。
5. 删除采用软删除：原人物记录、姓名、角色、原始学号、删除人和删除时间全部保留；账号被标记为不可登录，并从登录页右侧列表移除。
6. 删除时把对应 `student_numbers` 记录改为 `available`，下一位创建人物优先继承该学号。

因此删除不会制造一个永久空洞，学号也不会在删除后继续占用新号段。

为保证 `users.student_no` 的唯一约束仍能保护活动账号，软删除时数据库内部会将已删除行的 `student_no` 改写为 `__deleted__<用户ID>`，原始值仍保存在 `student_no_original`；所有 API 都返回原始学号。这样既能复用号码，也能完整追溯历史记录。

## 删除权限

- 只有 `super_admin` 可以调用 `DELETE /api/system/users/:id`。
- 普通管理员不再拥有系统管理接口；账号、配置和审计接口统一返回 `SUPER_ADMIN_REQUIRED`。
- 高级管理员不能删除自己，也不能删除其他高级管理员。
- 内置演示账号不参与自动学号池，默认受保护，不能删除。
- 自定义人物删除后仍保留在管理员的“已删除”筛选中，页面显示原始学号，便于追溯。
- 删除动作会删除该账号所有会话，同时写入 `audit_logs`，记录释放学号与下一可用学号。

## 数据库表

### `roles`

角色字典与等级，用于校验可分配范围和权限边界。

### `users`

| 字段 | 说明 |
| --- | --- |
| `id` | 用户主键 |
| `student_no` | 学号，唯一 |
| `student_no_original` | 原始学号；软删除后用于保留历史展示 |
| `name` | 姓名 |
| `role_key` | 外键，关联 `roles` |
| `college` | 专业或部门 |
| `bio` | 个人简介 |
| `avatar_url` | 自定义头像地址，仅接受系统图片上传目录中的文件 |
| `status` | `active`、`pending`、`disabled` |
| `source` | `builtin` 或 `custom` |
| `deleted_at` / `deleted_by` | 软删除时间与操作人 |
| `last_login_at` | 最近登录时间 |
| `created_at` / `updated_at` | 创建与更新时间 |

### `sessions`

保存会话令牌的 SHA-256 摘要、所属用户、创建时间、到期时间、最近活跃时间和 User-Agent。原始令牌只返回给浏览器一次，不写入数据库。

### `user_credentials`

与 `users` 一对一保存密码凭据：

- `password_hash`：`scrypt$<salt>$<hash>` 格式，不保存明文。
- `password_updated_at`：最近修改时间。
- `must_change_password`：旧账号迁移到默认密码时为 `1`，用户自行修改后重置为 `0`。

### `system_settings`

以 JSON 保存四个场景开关和 AI 参数，并记录最后修改时间与修改人。

### `student_number_sequence`

单行编号游标表。`start_number` 保存指定起始号，`next_value` 保存下一新号。

### `student_numbers`

学号台账。保存学号、`available/assigned` 状态、当前人物、分配时间、释放时间、复用次数和是否为系统自动生成。`current_user_id` 唯一，保证一个可用学号只归属一个当前账号。

### `audit_logs`

记录登录、自定义账号创建、个人资料修改、权限调整、配置修改等动作。审计详情使用 JSON 保存前后状态与操作 IP。

### `shared_documents`

云端共享业务快照表：

- `resource_key`：`classroom`、`lostfound`、`groupbuy`、`forum`、`notifications`、`dispatch`。
- `data_json`：当前完整业务快照。
- `version`：乐观并发版本号。
- `updated_at` / `updated_by`：最后修改时间与用户。

前端登录后会从服务端拉取资源。服务端没有记录时，用当前本地数据初始化云端；之后每次业务修改会防抖写入云端。客户端每 7 秒比较一次版本号，发现新版本会自动拉取。写入使用 `baseVersion` 做乐观锁，版本冲突返回 409 并同步服务端最新版本，避免静默覆盖。

读取共享快照时会按角色过滤。班委只能读取本人教室申请；管理员和高级管理员读取全部申请。写入时服务端会把无权修改或删除的记录合并回快照，避免普通用户通过替换快照越权操作他人内容。

增量接口只接收发生变化的记录，避免每次推送整份数组。单个共享文档序列化后限制为 4MB；图片通过 `/api/uploads/images` 独立存放到 `server/data/uploads/`，业务文档只保存 URL。上传图片上限为 5MB，支持 JPEG、PNG、WebP 和 GIF。

### `notifications`

按账号隔离的站内通知表，核心字段：

| 字段 | 说明 |
| --- | --- |
| `owner_user_id` | 通知接收人，唯一的数据归属依据 |
| `actor_user_id` | 触发通知的用户，系统通知可为空 |
| `type` / `title` / `content` / `link` | 消息内容与跳转地址 |
| `is_read` / `important` | 已读状态与重要标记 |
| `source_type` / `source_id` | 关联的论坛帖子、申请、拼单等业务对象 |
| `created_at` | 创建时间 |

默认只允许本人读取和修改。管理员与高级管理员可选择读取全部用户通知用于排查，但管理视角不能修改其他用户的通知。

### `ai_usage_logs`

记录每次真实 AI 请求的请求人、任务、场景、模型、成功状态、耗时、Token、请求编号和错误码。默认只允许本人读取；管理员与高级管理员可通过显式 `scope=all` 查看跨用户记录。

### `ai_provider_settings`

保存 DeepSeek 接入配置。API Key 使用 AES-256-GCM 加密后存入 `api_key_ciphertext`，另外只保存末 4 位、更新时间、最近测试状态与错误信息。完整密钥不会通过 API 返回浏览器。

### `schema_migrations`

记录数据库结构版本，为后续迁移保留入口。

## API

| Method | Path | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 公开 | 服务与数据库健康状态 |
| `GET` | `/api/auth/demo-accounts` | 公开 | 内置账号、自建人物与下一可用学号 |
| `GET` | `/api/auth/next-number` | 公开 | 查询下一可用学号 |
| `POST` | `/api/auth/register` | 公开 | 创建人物并自动分配学号 |
| `POST` | `/api/auth/login` | 公开 | 按姓名、学号和密码登录已有账号 |
| `GET` | `/api/auth/me` | 登录 | 校验令牌并返回最新用户权限 |
| `POST` | `/api/auth/logout` | 登录 | 删除当前会话 |
| `GET` | `/api/notifications?scope=own\|all` | 登录 | 按本人或管理视角读取通知 |
| `POST` | `/api/notifications` | 登录 | 创建本人或业务相关通知 |
| `PATCH` | `/api/notifications/:id` | 通知本人 | 修改本人通知已读/重要状态 |
| `DELETE` | `/api/notifications/:id` | 通知本人 | 删除本人通知 |
| `POST` | `/api/notifications/read-all` | 登录 | 将本人通知全部标为已读 |
| `DELETE` | `/api/notifications/read` | 登录 | 清空本人已读通知 |
| `GET` | `/api/ai/records?scope=own\|all` | 登录 | 读取本人或管理视角 AI 调用记录 |
| `PATCH` | `/api/me` | 登录 | 更新姓名、专业、简介和头像 |
| `PATCH` | `/api/me/password` | 自建人物 | 校验当前密码后修改密码 |
| `GET` | `/api/shared/meta` | 按资源 | 可访问资源的云端版本 |
| `GET` | `/api/shared/:resource` | 按资源 | 读取经过角色过滤的业务快照 |
| `PUT` | `/api/shared/:resource` | 按资源 | 带版本号写入，并在服务端校验记录归属 |
| `PUT` | `/api/shared/:resource/changes` | 按资源 | 按记录 ID 提交 `upserts`、`deletes` 与 `order` 增量 |
| `POST` | `/api/uploads/images` | 登录 | 以原始二进制上传图片，返回独立图片 URL |
| `GET` | `/api/uploads/images/:filename` | 公开随机 URL | 读取独立存储的图片 |
| `POST` | `/api/ai/parse` | 登录 | 调用 DeepSeek 解析校园需求 |
| `POST` | `/api/ai/generate` | 登录 | 生成论坛草稿、失物文案或讨论摘要 |
| `GET` | `/api/system/bootstrap` | 高级管理员 | 用户、角色、配置和审计记录 |
| `GET` | `/api/system/users` | 高级管理员 | 用户列表 |
| `PATCH` | `/api/system/users/:id` | 高级管理员 | 调整角色或账号状态 |
| `DELETE` | `/api/system/users/:id` | 高级管理员 | 软删除自建人物并释放学号 |
| `PATCH` | `/api/system/ai-provider` | 高级管理员 | 加密保存 DeepSeek API Key |
| `POST` | `/api/system/ai-provider/test` | 高级管理员 | 发起真实模型连接测试 |
| `PATCH` | `/api/system/settings` | 高级管理员 | 保存场景与 AI 配置 |
| `GET` | `/api/system/audit-logs` | 高级管理员 | 最近审计记录 |

统一响应格式：

```json
{
  "ok": true,
  "data": {}
}
```

```json
{
  "ok": false,
  "error": {
    "code": "ROLE_LEVEL_EXCEEDED",
    "message": "最高只能授予管理员权限"
  }
}
```

## 会话与安全

- 浏览器通过 `Authorization: Bearer <token>` 携带会话。
- 登录必须提供密码；账号不存在、姓名不匹配和密码错误统一返回 `INVALID_CREDENTIALS`，并增加随机失败延迟以降低枚举风险。
- 内置演示账号密码固定为 `123456`；自建人物密码可由本人在个人资料页修改。
- 会话默认有效期 7 天。
- 登录接口按 IP 限制为每分钟最多 20 次尝试。
- JSON 请求体限制为 32 KB。
- 所有 API 返回 `Cache-Control: no-store`。
- 生产模式对静态资源启用 MIME 校验、禁止目录穿越，并为 Vue History 路由提供 SPA 回退。
- 本项目使用演示密码与本地账号体系，不能替代正式校园统一身份认证。

## DeepSeek 接入

官方当前模型标识为 `deepseek-flash`，对应 DeepSeek-V4.1-Flash。服务端调用 `https://api.deepseek.com/chat/completions`，不从前端直接发请求。

- 高级管理员在管理页填写 API Key。
- 保存前校验 `sk-` 前缀和最小长度。
- 密钥加密后写入 SQLite，页面只显示末 4 位。
- “测试真实连接”会发起一次真实 Chat Completions 请求。
- AI 需求解析、论坛草稿、失物文案和论坛讨论摘要均优先调用真实模型。
- 未配置密钥、超时、限流、鉴权失败或模型响应异常时，前端会提示原因并降级到本地规则引擎。
- 每名用户 AI 请求限制为每分钟 12 次。

官方接口参考：

- <https://api-docs.deepseek.com/api/create-chat-completion>
- <https://api-docs.deepseek.com/quick_start/pricing>

## 当前数据边界

账号、密码、会话、角色、系统配置、业务共享快照、权限审计和 DeepSeek 接入配置均已迁移到后端 SQLite。浏览器 localStorage 现在只作为离线缓存和快速启动副本，不再作为多人共享的唯一数据源。学校统一身份认证仍未接入。
