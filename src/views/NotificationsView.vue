<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  AlarmClock,
  ArrowRight,
  Bell,
  ChatDotRound,
  Check,
  CircleCheck,
  Delete,
  Document,
  Link,
  Message,
  Search,
  Setting,
  StarFilled,
  WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import StatTile from '@/components/StatTile.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import { useNotifyStore } from '@/stores/notify'
import { fmtDateTime, timeAgo } from '@/utils/format'

const router = useRouter()
const notify = useNotifyStore()

const loading = ref(true)
const loadError = ref('')
const activeFilter = ref('all')
const onlyUnread = ref(false)
const keyword = ref('')
let timer = null

const TYPE_META = {
  apply: {
    label: '申请',
    icon: Document,
    tone: 'brand',
    types: ['status', 'application', 'apply', 'approval'],
  },
  match: {
    label: '匹配',
    icon: Search,
    tone: 'teal',
    types: ['match', 'matching', 'pair'],
  },
  system: {
    label: '系统',
    icon: Setting,
    tone: 'slate',
    types: ['system', 'notice', 'info'],
  },
  remind: {
    label: '提醒',
    icon: AlarmClock,
    tone: 'amber',
    types: ['deadline', 'conflict', 'remind', 'reminder'],
  },
  reply: {
    label: '回复',
    icon: ChatDotRound,
    tone: 'coral',
    types: ['reply', 'comment'],
  },
}

const FILTERS = [
  { key: 'all', label: '全部', icon: Bell },
  { key: 'important', label: '重要', icon: StarFilled },
  { key: 'apply', label: '申请', icon: Document },
  { key: 'match', label: '匹配', icon: Search },
  { key: 'reply', label: '回复', icon: ChatDotRound },
  { key: 'system', label: '系统', icon: Setting },
  { key: 'remind', label: '提醒', icon: AlarmClock },
]

const LINK_LABELS = {
  '/': '首页',
  '/classroom': '教室借用',
  '/lostfound': '失物招领',
  '/groupbuy': '拼团广场',
  '/forum': '校园论坛',
  '/ai-record': 'AI 使用记录',
  '/notifications': '通知中心',
  '/profile': '个人资料',
}

const readCount = computed(() => notify.items.filter((item) => item.read).length)
const hasFilter = computed(
  () => activeFilter.value !== 'all' || onlyUnread.value || Boolean(keyword.value.trim()),
)
const activeFilterLabel = computed(
  () => FILTERS.find((item) => item.key === activeFilter.value)?.label || '全部',
)

function groupOf(item) {
  if (item?.type === 'important') return 'important'
  const found = Object.entries(TYPE_META).find(([, meta]) => meta.types.includes(item?.type))
  return found ? found[0] : 'system'
}

function metaOf(item) {
  const key = groupOf(item)
  return TYPE_META[key] || TYPE_META.system
}

function isAiItem(item) {
  return (
    item?.type === 'match' ||
    /AI\s*(找到|生成|推荐|解析)/.test(`${item?.title || ''}${item?.content || ''}`)
  )
}

function filterCount(key) {
  if (key === 'all') return notify.items.length
  if (key === 'important') return notify.items.filter((item) => item.important).length
  return notify.items.filter((item) => groupOf(item) === key).length
}

function matchFilter(item, key) {
  if (key === 'all') return true
  if (key === 'important') return Boolean(item.important)
  return groupOf(item) === key
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return notify.items.filter((item) => {
    if (onlyUnread.value && item.read) return false
    if (!matchFilter(item, activeFilter.value)) return false
    if (kw) {
      const haystack = `${item.title || ''} ${item.content || ''}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })
})

const groups = computed(() => {
  const today = []
  const yesterday = []
  const earlier = []
  const now = dayjs().startOf('day')

  filtered.value.forEach((item) => {
    const date = dayjs(item.time)
    if (!date.isValid()) {
      earlier.push(item)
      return
    }
    const diff = now.diff(date.startOf('day'), 'day')
    if (diff <= 0) today.push(item)
    else if (diff === 1) yesterday.push(item)
    else earlier.push(item)
  })

  return [
    { key: 'today', label: '今天', items: today },
    { key: 'yesterday', label: '昨天', items: yesterday },
    { key: 'earlier', label: '更早', items: earlier },
  ].filter((group) => group.items.length)
})

const emptyTitle = computed(() =>
  notify.items.length === 0 ? '还没有任何消息' : '没有符合条件的消息',
)
const emptyDesc = computed(() =>
  notify.items.length === 0
    ? '申请审核、失物匹配与系统提醒都会出现在这里。'
    : '换一个类型，或清空搜索条件和「只看未读」再试试。',
)

async function loadNotifications() {
  loading.value = true
  loadError.value = ''
  window.clearTimeout(timer)
  try {
    await notify.refresh()
    if (!Array.isArray(notify.items)) throw new Error('notifications corrupted')
    if (notify.error) loadError.value = notify.error
  } catch {
    loadError.value = '通知数据读取失败，请检查云端连接后重新加载。'
  } finally {
    loading.value = false
  }
}

onMounted(loadNotifications)
onBeforeUnmount(() => window.clearTimeout(timer))

function resetFilters() {
  activeFilter.value = 'all'
  onlyUnread.value = false
  keyword.value = ''
}

function selectFilter(key) {
  activeFilter.value = key
}

function openItem(item) {
  if (!item.read && notify.isOwnItem(item)) notify.markRead(item.id)
  if (item.link) router.push(item.link)
  else ElMessage.info('这条消息没有关联页面')
}

async function changeScope(value) {
  const ok = await notify.setScope(value)
  if (!ok && value === 'all') {
    ElMessage.warning('无法切换到管理视角')
  }
}

function toggleRead(item) {
  if (item.read) {
    notify.markUnread(item.id)
    ElMessage.success('已标记为未读')
  } else {
    notify.markRead(item.id)
    ElMessage.success('已标记为已读')
  }
}

async function removeItem(item) {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定删除这条消息吗？', '删除消息', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  notify.remove(item.id)
  ElMessage.success('消息已删除')
}

function markAllRead() {
  const count = notify.unreadCount
  if (!count) return
  notify.markAllRead()
  ElMessage.success(`已把 ${count} 条消息标为已读`)
}

async function clearRead() {
  if (!readCount.value) return
  try {
    await ElMessageBox.confirm(
      `将清空 ${readCount.value} 条已读消息，未读消息会保留。此操作不可撤销。`,
      '清空已读消息',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  notify.clearRead()
  ElMessage.success('已清空已读消息')
}

function linkLabel(link) {
  if (LINK_LABELS[link]) return LINK_LABELS[link]
  if (String(link || '').startsWith('/forum')) return '校园论坛'
  return '查看详情'
}
</script>

<template>
  <div class="page nt">
    <PageHeader
      eyebrow="收件箱"
      title="消息通知中心"
      desc="申请审核、失物匹配、拼单进度与论坛回复，都收在这一处。点击消息可直接回到对应场景。"
    >
      <template #meta>
        <div class="row wrap gap-2">
          <span class="dot dot--brand dot--pulse"></span>
          <span class="t-xs muted">
            共 {{ notify.total }} 条 · 未读 {{ notify.unreadCount }} 条
          </span>
          <span v-if="notify.isAllScope" class="tag-soft tag-soft--amber">管理视角 · 全部用户</span>
        </div>
      </template>
      <template #actions>
        <el-radio-group
          v-if="notify.canSwitchScope"
          :model-value="notify.scope"
          size="small"
          class="nt-scope"
          @change="changeScope"
        >
          <el-radio-button value="own">仅本人</el-radio-button>
          <el-radio-button value="all">全部用户</el-radio-button>
        </el-radio-group>
        <el-button v-if="!notify.isAllScope" type="primary" :disabled="notify.unreadCount === 0" @click="markAllRead">
          <el-icon><Check /></el-icon>
          全部已读
        </el-button>
        <el-button v-if="!notify.isAllScope" plain :disabled="readCount === 0" @click="clearRead">
          <el-icon><Delete /></el-icon>
          清空已读
        </el-button>
      </template>
    </PageHeader>

    <!-- 加载态 -->
    <div v-if="loading" class="card card--pad-lg nt-loading">
      <el-skeleton :rows="9" animated />
    </div>

    <!-- 错误态 -->
    <div v-else-if="loadError" class="card card--pad-lg nt-state">
      <div class="nt-state__icon">
        <el-icon><WarningFilled /></el-icon>
      </div>
      <h3>消息加载失败</h3>
      <p>{{ loadError }}</p>
      <div class="row gap-3 wrap">
        <el-button type="primary" @click="loadNotifications">重新加载</el-button>
        <el-button plain @click="router.push('/profile')">去重置演示数据</el-button>
      </div>
    </div>

    <template v-else>
      <!-- 统计 -->
      <div class="grid g4">
        <StatTile
          label="未读消息"
          :value="notify.unreadCount"
          suffix="条"
          hint="点击列表可逐条阅读"
          tone="brand"
        >
          <template #icon>
            <el-icon><Bell /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="重要未读"
          :value="notify.importantUnread"
          suffix="条"
          hint="红色标题 +「重要」标记"
          tone="coral"
        >
          <template #icon>
            <el-icon><StarFilled /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="全部消息"
          :value="notify.total"
          suffix="条"
          hint="按时间分组，倒序展示"
          tone="teal"
        >
          <template #icon>
            <el-icon><Message /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="已读消息"
          :value="readCount"
          suffix="条"
          hint="可一键清空，未读会保留"
          tone="slate"
        >
          <template #icon>
            <el-icon><CircleCheck /></el-icon>
          </template>
        </StatTile>
      </div>

      <!-- 移动端横向筛选 -->
      <div class="nt-chips only-mobile">
        <button
          v-for="item in FILTERS"
          :key="item.key"
          type="button"
          class="chip nt-chip"
          :class="{ 'is-active': activeFilter === item.key }"
          @click="selectFilter(item.key)"
        >
          {{ item.label }}
          <span class="nt-chip__count">{{ filterCount(item.key) }}</span>
        </button>
      </div>

      <div class="nt-main">
        <!-- 左侧筛选（桌面） -->
        <aside class="nt-side only-desktop">
          <section class="card card--pad nt-filter-card">
            <div class="nt-filter-head">
              <h3>消息筛选</h3>
              <span class="faint t-xs">{{ notify.total }} 条</span>
            </div>

            <div class="nt-filters">
              <button
                v-for="item in FILTERS"
                :key="item.key"
                type="button"
                class="nt-filter"
                :class="{ 'is-active': activeFilter === item.key }"
                @click="selectFilter(item.key)"
              >
                <span class="nt-filter__icon">
                  <el-icon><component :is="item.icon" /></el-icon>
                </span>
                <span class="nt-filter__label">{{ item.label }}</span>
                <span class="nt-filter__count">{{ filterCount(item.key) }}</span>
              </button>
            </div>

            <div class="divider"></div>

            <div class="nt-only-unread">
              <div>
                <strong>只看未读</strong>
                <p>过滤掉已读消息，专注待处理项</p>
              </div>
              <el-switch v-model="onlyUnread" />
            </div>
          </section>

          <section class="card card--pad nt-tip">
            <div class="nt-tip__icon">
              <el-icon><Setting /></el-icon>
            </div>
            <div>
              <h4>通知偏好</h4>
              <p>重要提醒的强提示、每周摘要都可以在个人资料里调整。</p>
              <router-link to="/profile" class="nt-tip__link">
                去设置
                <el-icon><ArrowRight /></el-icon>
              </router-link>
            </div>
          </section>
        </aside>

        <!-- 右侧列表 -->
        <section class="card nt-list-card">
          <div class="nt-toolbar">
            <div class="nt-toolbar__title">
              <h2>消息列表</h2>
              <p>
                {{ activeFilterLabel }}消息
                · 共 {{ filtered.length }} 条<span v-if="onlyUnread"> · 仅未读</span>
              </p>
            </div>
            <div class="nt-toolbar__right">
              <el-input
                v-model="keyword"
                class="nt-search"
                placeholder="搜索标题或内容"
                :prefix-icon="Search"
                clearable
              />
              <el-switch
                v-model="onlyUnread"
                class="nt-only-switch"
                active-text="只看未读"
              />
            </div>
          </div>

          <div v-if="filtered.length === 0" class="nt-empty">
            <EmptyState :title="emptyTitle" :desc="emptyDesc">
              <template #icon>
                <el-icon><Bell /></el-icon>
              </template>
              <el-button v-if="hasFilter" type="primary" @click="resetFilters">
                清空筛选条件
              </el-button>
              <el-button v-else type="primary" @click="router.push('/')">
                去首页看看
              </el-button>
            </EmptyState>
          </div>

          <div v-else class="nt-groups">
            <div v-for="group in groups" :key="group.key" class="nt-group">
              <div class="nt-group__head">
                <span class="nt-group__label">{{ group.label }}</span>
                <span class="nt-group__line"></span>
                <span class="nt-group__count mono">{{ group.items.length }}</span>
              </div>

              <div class="nt-group__list">
                <article
                  v-for="item in group.items"
                  :key="item.id"
                  class="nt-item"
                  :class="{
                    'is-unread': !item.read,
                    'is-important': item.important,
                  }"
                  role="button"
                  tabindex="0"
                  @click="openItem(item)"
                  @keydown.enter.prevent="openItem(item)"
                  @keydown.space.prevent="openItem(item)"
                >
                  <span class="nt-item__bar" aria-hidden="true"></span>

                  <div class="nt-icon" :class="`nt-icon--${metaOf(item).tone}`">
                    <el-icon><component :is="metaOf(item).icon" /></el-icon>
                  </div>

                  <div class="nt-item__body">
                    <div class="nt-item__head">
                      <h3 class="nt-item__title">{{ item.title }}</h3>
                      <span v-if="item.important" class="nt-important">重要</span>
                      <span v-if="notify.isAllScope" class="tag-soft tag-soft--slate">
                        {{ item.ownerName }}
                      </span>
                      <AiBadge
                        v-if="isAiItem(item)"
                        text="AI 生成"
                        ghost
                        small
                        class="nt-ai"
                      />
                      <time
                        class="nt-item__time"
                        :datetime="item.time"
                        :title="fmtDateTime(item.time)"
                      >
                        {{ timeAgo(item.time) }}
                      </time>
                    </div>

                    <p class="nt-item__content clamp-2">{{ item.content }}</p>

                    <div class="nt-item__meta">
                      <span class="tag-soft" :class="`tag-soft--${metaOf(item).tone}`">
                        {{ metaOf(item).label }}
                      </span>
                      <span v-if="item.link" class="nt-item__link">
                        <el-icon><Link /></el-icon>
                        {{ linkLabel(item.link) }}
                      </span>
                      <span class="nt-item__spacer"></span>
                      <div v-if="notify.isOwnItem(item)" class="nt-item__actions">
                        <el-button text size="small" @click.stop="toggleRead(item)">
                          {{ item.read ? '标为未读' : '标为已读' }}
                        </el-button>
                        <el-button
                          text
                          size="small"
                          type="danger"
                          class="nt-item__delete"
                          @click.stop="removeItem(item)"
                        >
                          删除
                        </el-button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div v-if="filtered.length > 0" class="nt-list-foot">
            <span class="dot dot--teal"></span>
            点击消息会自动标为已读并跳转到对应场景；操作按钮不会触发跳转。
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.nt {
  gap: 16px;
}

/* 页头动作：范围切换降为安静的描边控件，只留「全部已读」一个实心高音量按钮；
   两组之间用留白分组（20px > 组内 8px），避免再加一条会随换行悬空的竖线 */
.nt-scope {
  margin-right: 12px;
}

.nt-scope :deep(.el-radio-button__inner) {
  border-color: var(--line) !important;
  background: transparent;
  color: var(--text-3);
  font-weight: 500;
  box-shadow: none !important;
}

.nt-scope :deep(.el-radio-button:hover .el-radio-button__inner) {
  border-color: var(--line-strong) !important;
  color: var(--text-1);
}

.nt-scope :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: var(--brand-300) !important;
  background: var(--brand-50);
  color: var(--brand-700);
  box-shadow: none !important;
}

/* ---------- 状态 ---------- */
.nt-loading {
  min-height: 320px;
}

.nt-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding-top: 48px;
  padding-bottom: 48px;
}

.nt-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: var(--coral-50, #fff0ef);
  color: var(--coral-500);
  font-size: 24px;
  margin-bottom: 4px;
}

.nt-state h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-1);
}

.nt-state p {
  margin: 0 0 8px;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}

/* ---------- 移动筛选 ---------- */
.nt-chips {
  margin: -6px 0 -2px;
  padding-bottom: 4px;
  overflow-x: auto;
  flex-wrap: nowrap;
  gap: 8px;
  scrollbar-width: none;
}

.nt-chips::-webkit-scrollbar {
  display: none;
}

.nt-chip {
  flex: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
}

.nt-chip__count {
  margin-left: 4px;
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.nt-chip.is-active .nt-chip__count {
  color: rgba(255, 255, 255, 0.78);
}

/* ---------- 主布局 ---------- */
.nt-main {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.nt-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: calc(var(--topbar-h) + 18px);
}

.nt-filter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.nt-filter-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.nt-filters {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nt-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur) var(--ease-out), color var(--dur) var(--ease-out),
    border-color var(--dur) var(--ease-out);
}

.nt-filter:hover {
  background: var(--surface-2);
  color: var(--text-1);
}

.nt-filter.is-active {
  background: var(--brand-50);
  border-color: var(--brand-100);
  color: var(--brand-700);
  font-weight: 600;
}

.nt-filter__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 14px;
  transition: background var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}

.nt-filter.is-active .nt-filter__icon {
  background: var(--brand-500);
  color: #fff;
}

.nt-filter__label {
  flex: 1;
}

.nt-filter__count {
  min-width: 22px;
  height: 20px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.nt-filter.is-active .nt-filter__count {
  background: var(--brand-100);
  color: var(--brand-700);
}

.nt-only-unread {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 0px;
}

.nt-only-unread strong {
  display: block;
  font-size: 12px;
  color: var(--text-1);
}

.nt-only-unread p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.nt-only-unread :deep(.el-switch) {
  flex: none;
}

.nt-tip {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--brand-50);
}

.nt-tip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--brand-500);
  box-shadow: var(--shadow-xs);
}

.nt-tip h4 {
  margin: 0px 0 4px;
  font-size: 13px;
  color: var(--text-1);
}

.nt-tip p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.nt-tip__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-500);
}

.nt-tip__link:hover {
  color: var(--brand-700);
}

/* ---------- 列表卡 ---------- */
.nt-list-card {
  overflow: hidden;
  min-width: 0;
}

.nt-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.nt-toolbar__title {
  min-width: 0;
}

.nt-toolbar__title h2 {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-1);
}

.nt-toolbar__title p {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.nt-toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.nt-search {
  width: 210px;
}

.nt-only-switch :deep(.el-switch__label) {
  font-size: 12px;
  color: var(--text-3);
}

.nt-groups {
  padding: 8px 24px 24px;
}

.nt-group {
  padding-top: 12px;
}

.nt-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0px 8px;
}

.nt-group__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.nt-group__line {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.nt-group__count {
  font-size: 12px;
  color: var(--text-4);
}

.nt-group__list {
  display: flex;
  flex-direction: column;
}

/* ---------- 单条消息 ---------- */
.nt-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 8px 16px 24px;
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  outline: none;
  transition: background var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out);
}

.nt-item:hover {
  background: var(--surface-2);
}

.nt-item:focus-visible {
  border-color: var(--brand-500);
  box-shadow: none;
}

.nt-item.is-unread {
  background: transparent;
}

.nt-item__bar {
  position: absolute;
  left: 0;
  top: 15px;
  bottom: 15px;
  width: 3px;
  border-radius: 0 4px 4px 0;
  background: var(--brand-500);
  opacity: 0;
  transition: opacity var(--dur) var(--ease-out);
}

.nt-item.is-unread .nt-item__bar {
  opacity: 1;
}

.nt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  font-size: 18px;
  margin-top: 0px;
}

.nt-icon--brand {
  background: var(--brand-50, #eef2f5);
  color: var(--brand-500);
}

.nt-icon--teal {
  background: var(--teal-50, #e9fbf9);
  color: var(--teal-600, #0c8f85);
}

.nt-icon--amber {
  background: var(--amber-50, #fff6e6);
  color: var(--amber-600, #b7791f);
}

.nt-icon--slate {
  background: var(--surface-3);
  color: var(--text-3);
}

.nt-item__body {
  flex: 1;
  min-width: 0;
}

.nt-item__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.nt-item__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
}

.nt-item.is-unread .nt-item__title {
  font-weight: 700;
}

.nt-item.is-important .nt-item__title {
  color: var(--coral-600, #d64545);
}

.nt-important {
  flex: none;
  padding: 0px 8px;
  border-radius: 999px;
  background: var(--coral-50, #fff0ef);
  border: 1px solid rgba(255, 107, 107, 0.22);
  color: var(--coral-600, #d64545);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.nt-ai {
  flex: none;
}

.nt-item__time {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}

.nt-item__content {
  margin: 4px 0 8px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

.nt-item__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 8px;
}

.nt-item__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.nt-item__spacer {
  flex: 1;
}

.nt-item__actions {
  display: flex;
  align-items: center;
  gap: 0px;
  margin: -4px -6px -4px 0;
}

.nt-item__actions :deep(.el-button) {
  font-size: 12px;
  padding: 4px 8px;
  height: auto;
}

.nt-item__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.nt-item__delete {
  color: var(--coral-500) !important;
}

.nt-item__delete:hover {
  color: var(--coral-600, #d64545) !important;
}

.nt-empty {
  padding: 24px 16px 32px;
}

.nt-list-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.nt-list-foot .dot {
  flex: none;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .nt-main {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .nt-search {
    width: 170px;
  }
}

@media (max-width: 900px) {
  .nt-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .nt-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px;
  }

  .nt-toolbar__right {
    margin-left: 0;
    gap: 8px;
  }

  .nt-search {
    flex: 1;
    width: auto;
  }

  .nt-groups {
    padding: 0px 12px 4px;
  }

  .nt-list-foot {
    padding: 12px 16px 16px;
  }
}

@media (max-width: 640px) {
  .nt {
    gap: 16px;
  }

  .nt-chips {
    margin-top: -4px;
  }

  .nt-toolbar__right {
    flex-wrap: wrap;
  }

  .nt-search {
    flex: 1 1 100%;
  }

  .nt-item {
    gap: 12px;
    padding: 12px 12px 12px 16px;
    border-radius: 8px;
  }

  .nt-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    font-size: 18px;
  }

  .nt-item__title {
    font-size: 13px;
  }

  .nt-item__time {
    font-size: 12px;
  }

  .nt-item__content {
    font-size: 12px;
    margin-bottom: 8px;
  }

  .nt-item__meta {
    gap: 8px;
  }

  .nt-item__spacer {
    display: none;
  }

  .nt-item__actions {
    width: 100%;
    margin: 0px 0 0;
    justify-content: flex-end;
  }

  .nt-item__actions :deep(.el-button) {
    padding: 4px 4px;
  }

  .nt-empty {
    padding: 12px 8px 16px;
  }
}
</style>
