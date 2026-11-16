# 校园智能调度平台 · 全栈实现契约（工程说明）

> 项目：校园智能调度平台（河南新华电脑学院 · AI 应用创意大赛 V1.0）
> 技术栈：Vue 3 + Vite + Element Plus + Pinia + Vue Router + Node.js + SQLite。
> 本文件沉淀设计系统、共享组件、Store 接口与 AI 查询参数约定，供后续开发者与评委查阅；页面实现均遵循此契约。

## 0. 运行与验收

```bash
cd campus-smart-dispatch-platform
npm install          # 已安装
npm run dev          # 同时启动前端 5173 与后端 3001
npm run test:backend # 后端账号与权限回归测试
./scripts-build.sh   # 必须 0 error 通过（等价 npm run build，但已处理本机 TMP 目录权限）
```

> 在部分受限环境（临时目录不可写）中，`npm run build` 可能报 `esbuild ... Access is denied`，
> 此时使用 `./scripts-build.sh`（把 TMP/TEMP/TMPDIR 指向项目内 `.tmp/`）。普通环境直接 `npm run build` 即可。

- 账号、会话、权限和系统配置由 Node.js 内置 HTTP 与 `node:sqlite` 提供，不新增后端 npm 依赖。
- 提交前必须 `npm run build` 通过；不允许 console error。
- 所有 UI 文案使用中文；金额用 `¥12.5`；时间用 `10-30 14:00` 或 `3 小时前`。
- 演示数据均为模拟数据，不出现真实手机号 / 身份证 / 住址。

## 1. 设计系统（必须复用，不要另造一套）

### 1.1 CSS 变量（`src/styles/tokens.css`）

| 变量 | 值/用途 |
| --- | --- |
| `--brand-500` / `--brand-600` | #6c63ff 电光紫，主色 |
| `--teal-500` | #12b3a6 青绿，辅助色（成功、情绪正向） |
| `--amber-500` | #f5a623 琥珀，警示/进行中 |
| `--coral-500` | #ff6b6b 珊瑚，重要/冲突 |
| `--brand-50/100/200/400/700` | 主色浅色阶，用于底色、边框、文字 |
| `--bg` | #f5f6fb 页面底色 |
| `--surface` / `--surface-2` / `--surface-3` | 卡片 / 次级底色 / 轨道灰 |
| `--text-1..4` | 主/次/辅/弱文字 |
| `--line` / `--line-strong` | 分割线 |
| `--radius-sm/md/lg/pill` | 圆角（卡片一律 18px = `--radius-lg`） |
| `--shadow-xs/sm/md/lg` | 阴影，**不要自写 box-shadow**，除非有特殊需求 |
| `--fs-xs..3xl` | 字号阶梯 11/12/13/14/16/18/22/28/34 |
| `--dur` / `--ease-out` | 过渡 200ms / cubic-bezier(.22,.61,.36,1) |
| `--grad-hero` / `--grad-brand-soft` | 深色渐变 / 品牌浅渐变 |

### 1.2 工具类（`src/styles/utilities.css`，必须优先使用）

布局：`.page`（最大宽 1360 居中）`.page--narrow` `.page-section`（纵向 gap14）
`.section-head` + `.section-head__title` + `.section-head__desc`
`.card`（白底圆角18 + 细边 + xs阴影）`.card--pad`（22px）`.card--pad-lg`（28px）`.card--hover` `.card--gradient` `.card--dark`
`.grid` + `.g2/.g3/.g4/.g-5-7/.g-7-5/.g-auto`
`.row` `.col` `.between` `.end` `.center` `.wrap` `.grow` `.gap-2..5` `.mt-*` `.mb-*`
字号：`.t-xs .t-sm .t-base .t-md .t-lg .t-xl .t-2xl .t-3xl`
颜色：`.muted .faint .dim .strong .bold .text-brand .text-teal .text-amber .text-coral .text-gradient`
文本：`.center-text .truncate .clamp-2 .clamp-3 .mono`
其他：`.divider .divider--v .chip-row .chip(.is-active/.chip--sm) .tag-soft(+--brand/teal/amber/coral/dark)`
`.kpi-value .kpi-label .kpi-delta .media-cover(+--teal/amber/coral/slate) .list-row .notice(+--amber/coral/teal) .ai-badge(--ghost) .dot(+--brand/--pulse) .toolbar .scroll-x .cover-art .lift .fade-up .d1..d4 .only-mobile .only-desktop`

断点：`1180px`（三列→两列）、`900px`（侧栏收起 + 底部 Tab）、`640px`（单列）。每个页面必须在这三个宽度下检查。

### 1.3 视觉规则

- 桌面端页面结构：`PageHeader` → KPI 卡或主内容卡 → 列表/详情。卡片之间 gap 14–20px。
- 页面主标题交给 `PageHeader`（顶栏已有标题，正文不要再放 h1 之外的大标题）。
- 主要按钮用 `<el-button type="primary">`；次要用 `plain` 或 `text`；危险操作用 `type="danger"`。
- 所有 AI 生成的内容必须显示 `<AiBadge />`（或 `<AiBadge ghost small />`）。
- 数字/编号/学号用 `.mono`；状态用 `<StatusPill>`。
- 空状态用 `<EmptyState>`；异步用 `<el-skeleton>` 或骨架卡片 + `v-loading` 二选一，禁止白屏。
- 不允许出现未样式化的原生 `<select>` / 默认 Element 灰蓝按钮大色块；配色统一走主题。

## 2. 共享组件（`src/components/`，**只读，不可修改**）

```vue
<PageHeader title="教室借用" desc="..." eyebrow="SCENE 01">
  <template #meta>...</template>
  <template #actions><el-button type="primary">...</el-button></template>
</PageHeader>

<SectionCard title="推荐结果" desc="AI 按容量/设备/距离综合排序">
  <template #actions>...</template>
  ...body
</SectionCard>

<StatTile label="待审核申请" value="2" suffix="单" hint="..." tone="amber" delta="+12%">
  <template #icon><el-icon><Calendar /></el-icon></template>
</StatTile>

<StatusPill status="pending" />            <!-- pending/approved/rejected/cancelled/matching/resolved/ongoing/success/expired/open/done/waiting -->
<StatusPill status="open" text="寻物" tone="coral" :dot="false" />
<EmptyState title="还没有申请" desc="...">
  <template #icon>...</template>
  <el-button>去借教室</el-button>
</EmptyState>
<ProgressRing :value="60" :size="62" :stroke="6" tone="brand" caption="已接龙" />
<CountdownText :target="item.deadline" />
<AvatarStack :names="['林小满','陈子昂']" :max="4" :size="28" />
<SceneIcon scene="classroom" :size="40" />
<AiBadge /> <AiBadge ghost small />
<AiThinking :steps="['解析意图','匹配资源','生成方案']" title="AI 正在推荐教室" />
<SceneTile scene="classroom" stat="42 处教学场所" @click="..." />
```

`AppLayout` / `AppSidebar` / `AiParseDialog` 已就绪，页面内不要重复实现侧栏、顶栏、AI 输入弹层。
需要触发 AI 入口：`useAppStore().openAiDialog('预填文本')`。

## 3. Pinia Stores（`src/stores/`，**只读，不可修改**）

统一从 `@/stores/xxx` 引入，`const s = useXxxStore()`。

### user
`user`（对象或 null：`{id, studentNo, name, roleKey, role, roleLevel, college, bio, status, source, loginAt, permissions}`）、`permissions`、`token`、`authReady`、`isLoggedIn`、`isAdmin`、`isSuperAdmin`、`canManageUsers`、`canViewOtherUsers`、`maskedNo`、`avatarStyle`
`login({studentNo,name,password})`、`loginDemo(account,password='123456')`、`createPerson(name,password)`、`logout()`、`restoreSession({force?})`、`updateProfile(patch)`、`changePassword({currentPassword,newPassword})`；以上账号方法均通过 `/api` 与后端交互。创建人物时学号由后端自动生成，前端不能指定。
`can(action)` 与 `canAccess(module)` 读取服务端返回的 `permissions`；路由和导航不得自行推断角色等级。

### app
`sidebarCollapsed`、`mobileNavOpen`、`aiDialog{visible,text}`、`pageLoading`
`toggleSidebar()`、`openAiDialog(text='')`、`closeAiDialog()`、`setPageLoading(bool)`

### notify
`items`（`{id,ownerId,ownerName,actorId,type,title,content,link,read,important,time,sourceType?,sourceId?}`，新→旧）、`scope('own'|'all')`、`canSwitchScope`、`isAllScope`、`unreadCount`、`importantUnread`、`total`、`unread`
`refresh({nextScope?,silent?})`、`setScope(nextScope)`、`add(payload)`、`isOwnItem(item)`、`markRead(id)`、`markUnread(id)`、`markAllRead()`、`remove(id)`、`clearRead()`。通知通过 `/api/notifications` 存取，不再使用共享快照。

### classroom
- `rooms`：`[{id,code,building,campus,floor,capacity,equipment[],rating,distance,tone,kind,className,headTeacher,teacher,computer,busy[{day,start,end,label}]}]`（42 处：A栋 36 间教室 + 会议室 + 报告厅；B栋 台球教室 + 3 间电竞教室；`capacity=0` 表示待核）
- `applications`：`[{id,roomId,roomCode,building,campus,date,day,start,end,purpose,people,applicant,contact,note,status,aiReason,createdAt,reviewedAt,timeline[{title,desc,time,pending?}]}]`
- `criteria`（`{campus,building,kind,day,start,end,capacity,equipment[],purpose}`）、`lastCriteria`
- `recommendations`：`[{room, score, matchScore, reasons[]}]`、`loading`
- `filters`：`{buildings[], kinds[], equipment[], slots[{label,start,end}], purposes[]}`
- `pendingApplications`、`approvedApplications`、`stats{total,pending,approved,rooms}`
- `getRoom(id)`、`getApplication(id)`、`freeSlotsOf(room, day)`（返回空闲时段数组，元素含 `{start,end,label}`，需自行兼容空数组）
- `setCriteria(patch)`、`recommend(input)`（async 900ms，写入 recommendations 并返回）、
- `apply({roomId,date,day,start,end,purpose,people,contact,note,aiReason?})` → 新申请（status=pending，自动通知）
- `approve(id)`、`reject(id, reason)`、`cancel(id)`

### lostfound
- `posts`：`[{id,type:'lost'|'found',ownerId,authorId,author,title,item,category,color,place,timeText,description,contact,contactMasked,aiGenerated,status:'open'|'matching'|'resolved',tone,createdAt,postNo,tags[],image}]`
- `publishing`、`keyword`、`typeFilter('all'|'lost'|'found')`、`categoryFilter`、`lostPosts`、`foundPosts`、`openCount`、`resolvedCount`、`filtered`
- `topPairs`：`[{lost, found, score, reasons[]}]`（前 3 组高相似，score≥55）
- `matchesFor(id)`：`[{post, score, reasons[]}]`（score≥40）
- `generateCopy(form)`：同步返回 `{title, content, tags[], ...}`（AI 文案）
- `publish(form)`：async 700ms，往 posts 前插并自动发匹配通知
- `isOwner(post)`、`canManage(post)`、`resolve(id)`、`reopen(id)`、`remove(id)`、`resetFilters()`

### groupbuy
- `items`：`[{id,title,product,category,unitPrice,targetCount,participants[{name,userId,count,at?}],deadline(ISO),pickup,owner,ownerId,note,tone,createdAt}]`
- `creating`、`keyword`、`category`、`ongoing`、`finished`、`mine`、`filtered`、`stats{ongoing,total,joined,saved}`
- `joinedCountOf(item)`、`statusOf(item)→'ongoing'|'success'|'expired'`、`progressOf(item)`、`remainingOf(item)`、`countdownOf(item)`
- `isJoined(item)`、`isOwner(item)`、`getById(id)`
- `create(form)`：async 650ms → 新拼单；`join(id,count=1)` → `{ok,message}`；`leave(id)`；`remove(id)`

### forum
- `posts`：`[{id,title,category,content,author,authorId,ownerId,authorRole,avatarTone,tags[],likes,views,solved,aiGenerated,createdAt,likedBy[],replies[{id,author,authorId,authorRole,content,createdAt,likes}]}]`（9 条 seed）
- `posting`、`replying`、`keyword`、`category('全部')`、`sortBy('active'|'latest'|'hot')`、`sorts`
- `categories`（含计数）、`stats{total,replies,solved,pending,today}`、`hotPosts`、`myPosts`、`unanswered`、`filtered`
- `getById(id)`、`canManagePost(post)`、`touchView(id)`、`pickTone(name)`、`resetFilters()`
- `create(form)`：async 650ms，新增帖子 + system 通知
- `reply(id, content)`：async 450ms，追加回复 + reply 通知（自己回自己 important=false）
- `toggleLike(id)`、`likeReply(postId, replyId)`、`markSolved(id)`、`remove(id)`
- `aiDraft(raw)` → `{title,category,tags[],content}`；`similarTo(draft, limit=3)` → `[{post,score,reasons[]}]`；`aiSummary(post)` → 速读摘要

### aiRecord
`data`（`{tools[], prompts[], iterations[], stats, compliance[]}`）、`usageRecords`、`usageScope('own'|'all')`、`usageLoading`、`usageError`、`activeRound`、`activePrompt`、`rounds`、`currentRound`、`prompts`、`currentPrompt`、`tools`、`stats`、`compliance`、`delta{accuracy,satisfaction,latency}`、`loadUsage(scope)`、`setRound(n)`、`setPrompt(n)`。`stats` 基于当前账号（或管理视角）真实调用记录计算。

### dispatch
`records`：`[{id,raw,scene,confidence,summary,status,createdAt}]`、`latest`、`recent`、`add(record)`、`clear()`

## 4. 路由（`src/router/index.js` 已定稿，不可修改）

| 路径 | 页面文件 | 负责人 |
| --- | --- | --- |
| `/` | `views/HomeView.vue` | Lead |
| `/login` | `views/LoginView.vue` | Lead |
| `/classroom` | `views/classroom/ClassroomView.vue` | class |
| `/classroom/status` | `views/classroom/ApplicationStatusView.vue` | class |
| `/classroom/status/:id` | `views/classroom/ApplicationDetailView.vue` | class |
| `/lostfound` | `views/lostfound/LostFoundView.vue` | lost |
| `/lostfound/publish` | `views/lostfound/PublishView.vue` | lost |
| `/groupbuy` | `views/groupbuy/GroupBuyView.vue` | buy |
| `/groupbuy/:id` | `views/groupbuy/GroupBuyDetailView.vue` | buy |
| `/forum` | `views/forum/ForumView.vue` | forum |
| `/forum/:id` | `views/forum/ForumDetailView.vue` | forum |
| `/notifications` | `views/NotificationsView.vue` | sys |
| `/ai-record` | `views/AiRecordView.vue` | sys |
| `/system` | `views/SystemView.vue` | sys |
| `/profile` | `views/ProfileView.vue` | sys |
| 404 | `views/NotFoundView.vue` | sys |

AI 弹层确认后携带 query 跳转，页面必须读取并预填：
- classroom：`?from=ai&day=3&start=15:00&end=17:00&capacity=40&equipment=投影,空调&building=&kind=教室&purpose=班会`
- lostfound：`?from=ai&type=lost&item=水杯&color=蓝色&place=A栋&time=周三下午&detail=...`
- groupbuy：`?from=ai&create=1&product=奶茶&price=12.5&target=10&pickup=...&time=...`
- forum：`?from=ai&create=1&title=A栋晚自习教室周末开放吗&category=求助问答&content=...&tags=A栋,自习`

进入页面后若 `route.query.from === 'ai'`，自动把这些值填进表单/筛选，并给一条 `el-alert` 或 `.notice` 提示「已根据你的描述预填，可修改后提交」。

## 5. 各页面功能要求（来自方案文档 FR）

### classroom（class）
- **借教室列表页**：顶部 AI 需求条（可再次唤起 AI 弹层）；筛选区（校区/类型/星期/时段/人数/设备 chip/用途；当只有一处楼栋时隐藏楼栋行）；「AI 推荐教室」按钮 → `recommend()`（loading 骨架）→ 展示 2–3 处候选卡片：房号、楼栋/楼层、类型、容量、设备标签、评分、距离、空闲时段、**推荐理由列表**、`<AiBadge ghost />`、一键申请按钮。
- 教学场所卡片列表（全部 42 处）：房号、类型、班级、容量（待核时显示「容量待核」）、设备、评分、状态；点击可看详情抽屉（含班级/班主任/授课教师/机房配置、当天课表 busy + 空闲时段）。
- 一键申请 → 弹窗确认（日期/时段/人数/用途/备注），提交调用 `apply()`，成功后跳 `/classroom/status/:id`。
- **我的申请**：状态 tabs（全部/待审核/已通过/已驳回/已取消）+ 卡片列表 + 统计；空状态。
- **申请详情**：房间信息、申请信息、AI 核验理由、timeline（已完成打勾/待处理脉冲）、操作（取消申请；管理员可 approve/reject，`user.isAdmin`）。
- 必须处理 `?from=ai` 预填（筛选 + 自动触发推荐）。

### lostfound（lost）
- **广场**：左右分栏（桌面）/上下（移动）。左侧信息流：类型 tab（全部/寻物/失物招领）、类别 chip、关键词搜索；卡片含 postNo、类型 pill、标题、描述、地点/时间、脱敏联系人（`contactMasked`，点击提示“登录后可查看脱敏联系方式”或复制占位）、`AiBadge`（aiGenerated 时）、状态、匹配数按钮。
- 右侧：`AI 双向匹配` 面板（topPairs，展示相似度 + 特征理由 + 前往查看），`发布入口` 卡（寻物/招领两个按钮 → `/lostfound/publish`），`数据小卡`（进行中/已完成）。
- 点卡片 → 详情弹窗（el-dialog）：完整信息、AI 匹配线索列表（`matchesFor`）、标记完成 / 重新匹配 / 删除（仅 owner：`post.contact` 匹配当前用户或演示数据允许）。
- **发布页**：类型切换、表单（物品名称、类别、颜色、地点、时间、描述、联系方式）；「AI 生成规范文案」优先调用 DeepSeek，失败时调用 `generateCopy(form)` 本地降级；图片压缩后通过独立上传接口保存，业务记录只保留 URL；提交调用 `publish()`，loading，成功跳广场并 ElMessage。

### groupbuy（buy）
- **列表页**：统计条（进行中/累计/我参与的/预计省下）；筛选（关键词/分类 chip/排序：最新/即将截止/最热）；卡片 grid：商品首字视觉块、标题、单价、进度条 + `ProgressRing`、已接龙/目标份数、`CountdownText` deadline、发起人、取货点、参与头像 `AvatarStack`、状态 pill、按钮（立即接龙 / 已接龙-取消 / 查看详情）；「发起拼单」按钮 → 弹窗表单（商品、分类、单价、目标份数、截止时间、取货点、备注），`create()` loading。
- 接龙交互：`join()` 成功 ElMessage + 失败提示（已成团/已结束）。已满/过期卡片置灰不可接龙。
- **详情页**：大卡（商品、单价、目标、进度环、倒计时、取货、发起人、备注、参与列表表格：成员/份数/时间/操作）；右侧：接龙操作卡（份数 stepper + 立即接龙/取消接龙）、AI 提醒说明（成团/截止自动通知）、安全提示。
- 路由 id 不存在 → 展示 EmptyState + 返回。
- 必须处理 `?create=1` 自动打开创建弹窗并预填。

### forum（forum）
- **帖子广场**：PageHeader + 双按钮（AI 帮我发帖、发布帖子）；4 个 StatTile（帖子总数/今日新帖/回复总数/待回复）；分类 chip（含计数）、搜索、排序（最新回复/最新发布/最热讨论）、只看未解决；帖子卡片含作者头像/角色/timeAgo、分类、已解决、`AiBadge`、标签、点赞（直连 `toggleLike`）、浏览/回复、查看讨论；右栏 sticky：本周热帖 TOP5、待回复求助、AI 引导卡、论坛公约。
- **发帖弹层**：一句话 AI 起草（620ms）→ `aiDraft` 回填标题/分类/正文/标签 + `AiBadge` + `similarTo` 相似帖预览；标题 4–40 字、正文 ≥10 字、标签 ≤3；发布调用 `create()`，成功后跳 `/forum/:id`；支持 `?create=1&from=ai` 预填并自动打开，关闭后清理 query。
- **帖子详情**：返回/面包屑、主帖（pre-wrap 正文、点赞、仅作者可标记解决/删除）、AI 速读（`aiSummary`，600ms）、回复列表（最新/最热）与回复编辑器（300 字，`reply`）、相似讨论、板块导航、论坛小贴士；无效 id 显示 EmptyState；进入时 `touchView`。
- 统计与计数统一用 store `stats`，不要自己重算。

### sys（sys）
- **通知中心**：默认仅本人；管理员/高级管理员显示“仅本人 / 全部用户”切换，全部用户视角只读。左侧类型筛选（全部/重要/申请/匹配/回复/系统/提醒）+ 本人范围下全部已读/清空已读；列表按时间分组；未读色条、重要标记、单条操作与 `link` 跳转；空状态。移动端单列。
- **AI 使用记录**：① 实际调用记录（当前账号或管理视角）② 工具与版本表 ③ 关键 Prompt 手风琴 ④ 两轮迭代对比 ⑤ 基于实际调用记录的统计卡 ⑥ 合规与隐私说明。管理员和高级管理员可显式切换全部用户视角。
- **系统控制台**（高级管理员）：从 `/api/system/bootstrap` 读取用户、角色、自动学号池、配置与审计记录；普通管理员不再拥有 `/system` 页面或 `/api/system/*` 接口。控制台使用“账号与配置 / 日志与审计”两个分区，避免长页面堆叠。
- **个人资料**：头像块（`avatarStyle`）、姓名/学号脱敏（`maskedNo`）、院系/角色、编辑表单（`updateProfile`）、偏好开关（通知/重要提醒）、退出登录、演示数据重置按钮（`resetAll()` from `@/utils/storage` + reload）。
- **404**：品牌插画（CSS/SVG）、返回首页/返回上一页。

## 6. AI 能力层调用（`src/utils/aiEngine.js`，只读）

- `parseRequirement(text)` → `{ok,scene,sceneName,confidence,summary,fields[],missing,slots,route,routeQuery,actionHint,tags,engine}`
- `recommendClassrooms(rooms, criteria)`、`buildLostfoundCopy(form)`、`scoreLostPair(a,b)`、`buildForumDraft(raw)`、`scoreForumPost(post, draft)`、`similarForumPosts(posts, draft, limit)`、`summarizeForumReplies(post)`、`sleep(ms)`
- 页面里不要再自己写"假 AI 规则"，统一调用 store（内部已用 aiEngine）。
- 所有 AI 结论必须给"理由"；低置信度（<0.72）必须提示人工核对。

## 7. 协作规则（重要）

1. **只改自己负责的文件**（上表）。共享文件（`components/`、`stores/`、`utils/`、`styles/`、`router/`、`main.js`、`App.vue`、`layouts/`、`mock/`、`package.json`）一律不改。
2. 页面私有子组件放在自己场景目录下，例如 `src/views/classroom/components/RoomCard.vue`；跨场景复用的组件不要新建，先用共享组件。
3. 不改路由；不新增依赖；不改 `vite.config.js`。
4. 每写完一个页面立刻 `npm run build` 验证（可只 build 一次收尾）。构建失败必须自己修到通过。
5. 完成后向 Lead 汇报：改了哪些文件、实现了哪些交互、build 结果、已知问题。
6. 设计风格与 `HomeView.vue` 对齐（先读它，模仿其卡片、留白、渐变、字号节奏）。
7. 移动端 390px 宽度不能有横向滚动；表格在移动端改卡片或横向滚动容器。

## 8. 交付物

- 可 `npm run dev` 直接预览的完整前端项目。
- 所有页面无「待开发」占位。
- `README.md`（Lead 负责）说明运行方式、页面地图、AI 模拟说明、演示账号。
