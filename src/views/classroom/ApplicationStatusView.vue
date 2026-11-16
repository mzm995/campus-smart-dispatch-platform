<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Calendar,
  CircleCheck,
  CircleClose,
  Clock,
  MagicStick,
  Refresh,
  School,
  Tickets,
  User,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import StatTile from '@/components/StatTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN, fmtDate, timeAgo } from '@/utils/format'
import { sleep } from '@/utils/aiEngine'

const router = useRouter()
const classroom = useClassroomStore()

const activeTab = ref('all')
const refreshing = ref(false)
const booting = ref(true)
let bootTimer = null

const stats = computed(() => {
  const list = classroom.applications
  const byStatus = (status) => list.filter((item) => item.status === status).length
  return {
    total: list.length,
    pending: byStatus('pending'),
    approved: byStatus('approved'),
    rejected: byStatus('rejected'),
    cancelled: byStatus('cancelled'),
    closed: byStatus('rejected') + byStatus('cancelled'),
  }
})

const tabs = computed(() => [
  { key: 'all', label: '全部', count: stats.value.total },
  { key: 'pending', label: '待审核', count: stats.value.pending },
  { key: 'approved', label: '已通过', count: stats.value.approved },
  { key: 'rejected', label: '已驳回', count: stats.value.rejected },
  { key: 'cancelled', label: '已取消', count: stats.value.cancelled },
])

const filtered = computed(() => {
  if (activeTab.value === 'all') return classroom.applications
  return classroom.applications.filter((item) => item.status === activeTab.value)
})

const emptyCopy = computed(() => {
  const map = {
    all: {
      title: '还没有教室申请',
      desc: '去「教室借用」页选一处合适的场所，AI 会帮你核验时段、容量与设备，再一键提交。',
    },
    pending: {
      title: '没有待审核的申请',
      desc: '当前没有等待管理员处理的申请，新的申请会自动出现在这里。',
    },
    approved: {
      title: '还没有通过的申请',
      desc: '申请审核通过后会出现在这里，并同步到消息通知。',
    },
    rejected: {
      title: '没有已驳回的申请',
      desc: '一切顺利，目前没有申请被驳回。',
    },
    cancelled: {
      title: '没有已取消的申请',
      desc: '取消的申请会保留在这里，方便你按同样的条件再次申请。',
    },
  }
  return map[activeTab.value] || map.all
})

function toneOf(item) {
  return classroom.getRoom(item.roomId)?.tone || 'brand'
}

function goDetail(item) {
  router.push(`/classroom/status/${item.id}`)
}

async function refresh() {
  refreshing.value = true
  await sleep(500)
  refreshing.value = false
  ElMessage.success('已刷新申请状态')
}

onMounted(() => {
  bootTimer = setTimeout(() => {
    booting.value = false
  }, 360)
})

onBeforeUnmount(() => {
  clearTimeout(bootTimer)
})
</script>

<template>
  <div class="page status-page">
    <PageHeader title="我的申请" desc="跟踪每一条教室申请的审核进度，AI 核验理由与状态变更都留在这里。">
      <template #actions>
        <el-button :loading="refreshing" @click="refresh">
          <el-icon v-if="!refreshing"><Refresh /></el-icon>
          刷新状态
        </el-button>
        <el-button type="primary" @click="router.push('/classroom')">
          <el-icon><School /></el-icon>
          去借教室
        </el-button>
      </template>
    </PageHeader>

    <div class="notice track-notice">
      <span class="track-notice__icon">
        <el-icon :size="15"><MagicStick /></el-icon>
      </span>
      <div class="track-notice__text">
        <strong>AI 正在跟踪申请进度</strong>
        <p v-if="stats.pending">
          还有 {{ stats.pending }} 条申请等待管理员审核，结果会推送到消息通知，你不需要留在这里刷新。
        </p>
        <p v-else>所有申请都已有结果，新的申请会在这里继续跟踪。</p>
      </div>
      <AiBadge ghost small text="AI 跟踪" />
    </div>

    <div class="grid g4 stat-grid">
      <StatTile label="全部申请" :value="stats.total" suffix="条" hint="近 7 天提交" tone="brand">
        <template #icon>
          <el-icon><Tickets /></el-icon>
        </template>
      </StatTile>
      <StatTile label="待审核" :value="stats.pending" suffix="条" hint="预计 2 小时内完成" tone="amber">
        <template #icon>
          <el-icon><Clock /></el-icon>
        </template>
      </StatTile>
      <StatTile label="已通过" :value="stats.approved" suffix="条" hint="按时使用，离场关电" tone="teal">
        <template #icon>
          <el-icon><CircleCheck /></el-icon>
        </template>
      </StatTile>
      <StatTile label="未通过 / 已取消" :value="stats.closed" suffix="条" hint="可调整条件重新申请" tone="coral">
        <template #icon>
          <el-icon><CircleClose /></el-icon>
        </template>
      </StatTile>
    </div>

    <div class="status-bar card">
      <div class="status-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="status-tab"
          :class="{ 'is-active': activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="status-tab__count">{{ tab.count }}</span>
        </button>
      </div>
      <span class="status-bar__summary">共 {{ filtered.length }} 条</span>
    </div>

    <div v-if="booting" class="app-grid">
      <div v-for="index in 4" :key="index" class="app-skeleton card">
        <div class="app-skeleton__head">
          <div class="sk sk--art"></div>
          <div class="grow">
            <div class="sk sk--line w60"></div>
            <div class="sk sk--line w40"></div>
          </div>
        </div>
        <div class="sk sk--line w80"></div>
        <div class="sk sk--block"></div>
        <div class="sk sk--line w50"></div>
      </div>
    </div>

    <div v-else-if="filtered.length" class="app-grid">
      <article
        v-for="item in filtered"
        :key="item.id"
        class="app-card card"
        role="button"
        tabindex="0"
        :aria-label="`查看 ${item.building} ${item.roomCode} 的申请详情`"
        @click="goDetail(item)"
        @keydown.enter="goDetail(item)"
      >
        <div class="app-card__head">
          <div class="app-card__art media-cover" :class="`media-cover--${toneOf(item)}`">
            <span>{{ item.roomCode }}</span>
          </div>
          <div class="app-card__head-text">
            <div class="app-card__title-row">
              <h3 class="app-card__title">{{ item.building }} {{ item.roomCode }}</h3>
              <StatusPill :status="item.status" />
            </div>
            <p class="app-card__sub">
              {{ item.campus }} · {{ item.purpose }} · {{ item.people }} 人
            </p>
          </div>
        </div>

        <div class="app-card__meta">
          <span>
            <el-icon :size="12"><Calendar /></el-icon>
            {{ fmtDate(item.date, 'MM-DD') }} {{ WEEK_CN[Number(item.day) % 7] }}
          </span>
          <span>
            <el-icon :size="12"><Clock /></el-icon>
            {{ item.start }}–{{ item.end }}
          </span>
          <span class="app-card__meta-end">
            <el-icon :size="12"><User /></el-icon>
            {{ item.people }} 人
          </span>
        </div>

        <div class="app-card__ai">
          <div class="app-card__ai-head">
            <span class="app-card__ai-label">
              <el-icon :size="12"><MagicStick /></el-icon>
              AI 核验理由
            </span>
            <AiBadge ghost small />
          </div>
          <p class="app-card__ai-text clamp-2">{{ item.aiReason }}</p>
        </div>

        <div class="app-card__foot">
          <span class="app-card__time">{{ timeAgo(item.createdAt) }}提交</span>
          <span class="app-card__link">
            查看详情
            <el-icon :size="12"><ArrowRight /></el-icon>
          </span>
        </div>
      </article>
    </div>

    <div v-else class="card app-empty">
      <EmptyState :title="emptyCopy.title" :desc="emptyCopy.desc">
        <template #icon>
          <span class="app-empty__icon">
            <el-icon :size="24"><School /></el-icon>
          </span>
        </template>
        <el-button type="primary" @click="router.push('/classroom')">
          <el-icon><School /></el-icon>
          去借教室
        </el-button>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.status-page {
  max-width: var(--content-max);
}

/* ---------- AI 跟踪 ---------- */
.track-notice {
  align-items: center;
  padding: 13px 15px;
  border: 1px solid var(--brand-100);
  background: linear-gradient(120deg, var(--brand-50), var(--teal-50));
  color: var(--text-2);
}

.track-notice__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  flex: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
}

.track-notice__text {
  flex: 1;
  min-width: 0;
}

.track-notice__text strong {
  display: block;
  font-size: 12.5px;
  font-weight: 680;
  color: var(--text-1);
}

.track-notice__text p {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- 状态 tab ---------- */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
}

.status-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.status-tabs::-webkit-scrollbar {
  display: none;
}

.status-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  flex: none;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.status-tab:hover {
  background: var(--surface-3);
  color: var(--text-2);
}

.status-tab.is-active {
  background: var(--brand-500);
  color: #fff;
  box-shadow: 0 8px 18px -11px rgba(108, 99, 255, 0.95);
}

.status-tab__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 9.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.status-tab.is-active .status-tab__count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.status-bar__summary {
  flex: none;
  padding-right: 4px;
  font-size: 10.5px;
  color: var(--text-3);
}

/* ---------- 申请卡片 ---------- */
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(342px, 1fr));
  gap: 16px;
}

.app-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 16px;
  cursor: pointer;
  transition:
    transform 0.24s var(--ease-out),
    box-shadow 0.24s var(--ease-out),
    border-color 0.24s var(--ease-out);
}

.app-card:hover {
  transform: translateY(-3px);
  border-color: var(--brand-200);
  box-shadow: var(--shadow-md);
}

.app-card:focus-visible {
  outline: 2px solid var(--brand-300);
  outline-offset: 2px;
}

.app-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-card__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 4px;
  flex: none;
  border-radius: 14px;
  text-align: center;
}

.app-card__art span {
  position: relative;
  z-index: 1;
  font-size: 11.5px;
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: -0.01em;
  word-break: break-word;
}

.app-card__head-text {
  flex: 1;
  min-width: 0;
}

.app-card__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-card__title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__sub {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 11px;
  color: var(--text-2);
}

.app-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.app-card__meta-end {
  margin-left: auto;
  color: var(--text-3);
}

.app-card__ai {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  border: 1px dashed var(--brand-100);
  border-radius: 11px;
  background: linear-gradient(135deg, rgba(238, 236, 255, 0.55), rgba(230, 250, 247, 0.45));
}

.app-card__ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-card__ai-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--brand-700);
  letter-spacing: 0.02em;
}

.app-card__ai-text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.app-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 2px;
  font-size: 10.5px;
  color: var(--text-3);
}

.app-card__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--brand-600);
  font-weight: 650;
}

/* ---------- 空状态 ---------- */
.app-empty {
  padding: 10px;
}

.app-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 17px;
  background: linear-gradient(135deg, #eeecff, #e6faf7);
  color: var(--brand-500);
}

/* ---------- 骨架 ---------- */
.app-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.app-skeleton__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sk {
  border-radius: 8px;
  background: linear-gradient(90deg, var(--surface-3) 25%, #fff 37%, var(--surface-3) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--art {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 14px;
}

.sk--line {
  height: 11px;
  margin-top: 8px;
}

.sk--line:first-child {
  margin-top: 0;
}

.sk--block {
  height: 74px;
  border-radius: 10px;
}

.w40 {
  width: 40%;
}

.w50 {
  width: 50%;
}

.w60 {
  width: 60%;
}

.w80 {
  width: 80%;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

@media (max-width: 900px) {
  .app-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
}

@media (max-width: 700px) {
  .track-notice {
    align-items: flex-start;
  }

  .track-notice :deep(.ai-badge) {
    display: none;
  }

  .status-bar {
    align-items: center;
  }

  .status-bar__summary {
    display: none;
  }

  .app-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
