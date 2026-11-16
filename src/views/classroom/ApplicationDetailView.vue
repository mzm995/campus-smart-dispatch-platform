<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  Document,
  InfoFilled,
  School,
  StarFilled,
  Tickets,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useClassroomStore } from '@/stores/classroom'
import { useUserStore } from '@/stores/user'
import { WEEK_CN, fmtDate, fmtDateTime } from '@/utils/format'
import { roomFreeAt, sleep } from '@/utils/aiEngine'

const route = useRoute()
const router = useRouter()
const classroom = useClassroomStore()
const user = useUserStore()

const app = computed(() => classroom.getApplication(route.params.id) || null)
const room = computed(() => (app.value ? classroom.getRoom(app.value.roomId) : null))

const statusCopy = computed(() => {
  const map = {
    pending: {
      title: '申请已提交，等待审核',
      desc: '管理员通常会在 2 小时内处理，审核结果会推送到消息通知。',
    },
    approved: {
      title: '申请已通过，可以按时使用',
      desc: '请提前 10 分钟到场，使用结束后关闭设备与电源，恢复场所原样。',
    },
    rejected: {
      title: '申请未通过',
      desc: '请根据驳回理由调整场地或时段后重新提交申请。',
    },
    cancelled: {
      title: '申请已取消',
      desc: '这条申请已关闭，如需使用场所可以重新提交申请。',
    },
  }
  return map[app.value?.status] || map.pending
})

const statusIcon = computed(() => {
  const map = {
    pending: Clock,
    approved: CircleCheck,
    rejected: CircleClose,
    cancelled: InfoFilled,
  }
  return map[app.value?.status] || Clock
})

const toneClass = computed(() => `media-cover--${room.value?.tone || 'brand'}`)

const canCancel = computed(() => app.value?.status === 'pending' && !user.isAdmin)
const canReview = computed(() => Boolean(user.isAdmin && app.value?.status === 'pending'))

const checks = computed(() => {
  if (!app.value) return []
  const target = room.value
  const people = Number(app.value.people) || 0
  const capacityMissing = Boolean(target && !target.capacity)
  const capacityOk = Boolean(target && target.capacity >= people)
  const free = target ? roomFreeAt(target, app.value.day, app.value.start, app.value.end) : false
  return [
    {
      label: '容量匹配',
      ok: capacityMissing ? false : capacityOk,
      text: capacityMissing
        ? `该场地容量待核，申请 ${people} 人，请管理员确认`
        : target
          ? `场地 ${target.capacity} 人，申请 ${people} 人，${capacityOk ? '余量充足' : '超出场地容量'}`
          : '缺少场地信息，请人工核对',
    },
    {
      label: '设备匹配',
      ok: Boolean(target?.equipment?.length),
      text: target?.equipment?.length
        ? `已配备 ${target.equipment.slice(0, 3).join('、')} 等 ${target.equipment.length} 项设备`
        : '暂无设备记录，建议现场确认',
    },
    {
      label: '时段冲突',
      ok: free,
      text: free
        ? `${WEEK_CN[Number(app.value.day) % 7]} ${app.value.start}–${app.value.end} 当前空闲`
        : '该时段当前显示为占用，请人工核对',
    },
  ]
})

const hasConflict = computed(() => checks.value.some((check) => !check.ok))

const timelineItems = computed(() => {
  if (!app.value) return []
  const list = Array.isArray(app.value.timeline) ? app.value.timeline : []
  return list
    .filter((entry) => !(app.value.status !== 'pending' && entry.pending))
    .map((entry) => ({
      ...entry,
      done: !entry.pending,
      timeText: entry.time ? fmtDateTime(entry.time) : '待处理',
    }))
})

const otherFreeSlots = computed(() => {
  if (!room.value || !app.value) return []
  return classroom
    .freeSlotsOf(room.value, app.value.day)
    .filter((slot) => !(slot.start === app.value.start && slot.end === app.value.end))
    .slice(0, 6)
})

const cancelLoading = ref(false)
const adminLoading = ref(false)
const rejectVisible = ref(false)
const rejectReason = ref('')
const rejecting = ref(false)

const quickReasons = ['该时段场地已有教学安排', '用途与场地属性不符', '人数超出场地容量', '设备条件不满足需求']

function goStatus() {
  router.push('/classroom/status')
}

function goClassroom() {
  router.push('/classroom')
}

async function approve() {
  if (!app.value) return
  try {
    await ElMessageBox.confirm(
      `确认通过「${app.value.building} ${app.value.roomCode}」的借用申请？通过后会通知申请人。`,
      '审核通过',
      { confirmButtonText: '确认通过', cancelButtonText: '再想想', type: 'success' },
    )
    adminLoading.value = true
    await sleep(600)
    classroom.approve(app.value.id)
    ElMessage.success('已审核通过，申请人会收到通知')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error('操作没有完成，请稍后重试')
    }
  } finally {
    adminLoading.value = false
  }
}

function openReject() {
  rejectReason.value = ''
  rejectVisible.value = true
}

async function submitReject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回理由，方便申请人调整后重新提交')
    return
  }
  if (!app.value) return
  rejecting.value = true
  await sleep(500)
  classroom.reject(app.value.id, rejectReason.value.trim())
  rejecting.value = false
  rejectVisible.value = false
  ElMessage.success('已驳回该申请')
}

async function cancelApplication() {
  if (!app.value) return
  try {
    await ElMessageBox.confirm('取消后需要重新提交申请，确认取消吗？', '取消申请', {
      confirmButtonText: '确认取消',
      cancelButtonText: '保留申请',
      type: 'warning',
    })
    cancelLoading.value = true
    await sleep(500)
    classroom.cancel(app.value.id)
    ElMessage.success('申请已取消')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error('取消失败，请稍后重试')
    }
  } finally {
    cancelLoading.value = false
  }
}
</script>

<template>
  <div class="page detail-page">
    <nav class="detail-crumb" aria-label="面包屑">
      <button type="button" class="detail-crumb__link" @click="goStatus">
        <el-icon :size="12"><ArrowLeft /></el-icon>
        我的申请
      </button>
      <span class="detail-crumb__sep">/</span>
      <span class="detail-crumb__current">申请详情</span>
    </nav>

    <PageHeader title="申请详情" desc="查看教学场所核验、审核进度与本次申请的全部记录。">
      <template #actions>
        <el-button @click="goStatus">
          <el-icon><Tickets /></el-icon>
          我的申请
        </el-button>
        <el-button type="primary" @click="goClassroom">
          <el-icon><School /></el-icon>
          继续借教室
        </el-button>
      </template>
    </PageHeader>

    <template v-if="app">
      <section class="detail-banner" :class="`is-${app.status}`">
        <span class="detail-banner__icon">
          <el-icon :size="18"><component :is="statusIcon" /></el-icon>
        </span>
        <div class="grow">
          <h2 class="detail-banner__title">{{ statusCopy.title }}</h2>
          <p class="detail-banner__desc">{{ statusCopy.desc }}</p>
        </div>
        <StatusPill :status="app.status" />
      </section>

      <div class="detail-grid">
        <div class="detail-main">
          <SectionCard>
            <div class="detail-room-head">
              <div class="detail-room-art media-cover" :class="toneClass">
                <span>{{ app.roomCode }}</span>
              </div>
              <div class="grow">
                <h2 class="detail-room-title">{{ app.building }} {{ app.roomCode }}</h2>
                <p class="detail-room-sub">
                  {{ app.campus }}
                  <template v-if="room"> · {{ room.floor }} 楼</template>
                  · {{ app.purpose }}
                </p>
              </div>
              <div v-if="room" class="detail-rating">
                <el-icon :size="12"><StarFilled /></el-icon>
                {{ Number(room.rating).toFixed(1) }}
              </div>
            </div>

            <div class="detail-metrics">
              <div class="detail-metric">
                <span>借用日期</span>
                <strong>{{ fmtDate(app.date, 'YYYY-MM-DD') }} {{ WEEK_CN[Number(app.day) % 7] }}</strong>
              </div>
              <div class="detail-metric">
                <span>使用时段</span>
                <strong>{{ app.start }}–{{ app.end }}</strong>
              </div>
              <div class="detail-metric">
                <span>使用人数</span>
                <strong>{{ app.people }} 人</strong>
              </div>
              <div class="detail-metric">
                <span>申请用途</span>
                <strong>{{ app.purpose }}</strong>
              </div>
              <div class="detail-metric">
                <span>提交时间</span>
                <strong>{{ fmtDateTime(app.createdAt) }}</strong>
              </div>
              <div class="detail-metric">
                <span>审核时间</span>
                <strong>{{ app.reviewedAt ? fmtDateTime(app.reviewedAt) : '等待审核' }}</strong>
              </div>
            </div>

            <p v-if="app.note" class="detail-note">
              <el-icon :size="12"><Document /></el-icon>
              备注：{{ app.note }}
            </p>
          </SectionCard>

          <SectionCard title="AI 资源核验" desc="提交时 AI 已对容量、设备与时段做了一次预核验。">
            <template #actions>
              <AiBadge />
            </template>

            <p class="detail-ai__summary">
              {{ app.aiReason || '这条申请没有留下 AI 核验记录，建议联系管理员人工核对。' }}
            </p>

            <div class="detail-checks">
              <div
                v-for="check in checks"
                :key="check.label"
                class="detail-check"
                :class="check.ok ? 'is-ok' : 'is-warn'"
              >
                <span class="detail-check__icon">
                  <el-icon :size="15">
                    <component :is="check.ok ? CircleCheck : Warning" />
                  </el-icon>
                </span>
                <div class="grow">
                  <strong>{{ check.label }}</strong>
                  <p>{{ check.text }}</p>
                </div>
                <span class="detail-check__state">{{ check.ok ? '通过' : '需核对' }}</span>
              </div>
            </div>

            <div v-if="hasConflict" class="notice notice--amber detail-ai__notice">
              <el-icon><Warning /></el-icon>
              <span>资源状态可能已变化，AI 结果仅作参考，请在到场前联系管理员人工核对。</span>
            </div>
            <p class="detail-ai__foot">
              AI 核验为辅助参考，最终借用结果以管理员审核和现场安排为准。
            </p>
          </SectionCard>

          <SectionCard title="状态时间线" desc="每一次状态变化都会记录在这里。">
            <div class="detail-timeline">
              <div
                v-for="(entry, index) in timelineItems"
                :key="`${entry.title}-${index}`"
                class="detail-timeline__item"
                :class="{ 'is-pending': entry.pending, 'is-last': index === timelineItems.length - 1 }"
              >
                <div class="detail-timeline__rail">
                  <span class="detail-timeline__dot" :class="entry.done ? 'is-done' : 'is-pending'">
                    <el-icon v-if="entry.done" :size="11"><CircleCheck /></el-icon>
                    <span v-else class="detail-timeline__pulse" />
                  </span>
                  <span class="detail-timeline__line" />
                </div>
                <div class="detail-timeline__body">
                  <div class="detail-timeline__head">
                    <strong>{{ entry.title }}</strong>
                    <time>{{ entry.timeText }}</time>
                  </div>
                  <p>{{ entry.desc }}</p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside class="detail-side">
          <SectionCard title="场所信息">
            <template #actions>
              <span class="tag-soft tag-soft--teal">正常开放</span>
            </template>

            <div v-if="room" class="detail-room">
              <div class="detail-room__art media-cover" :class="toneClass">
                <span>{{ app.roomCode }}</span>
              </div>
              <div class="grow">
                <h3>{{ app.building }} {{ app.roomCode }}</h3>
                <p>{{ app.campus }} · {{ room.floor }} 楼</p>
              </div>
            </div>

            <div v-if="room" class="detail-room__meta">
              <span>{{ room.capacity ? `容量 ${room.capacity} 人` : '容量待核' }}</span>
              <span>距离 {{ room.distance }} m</span>
            </div>

            <div v-if="room && (room.className || room.headTeacher)" class="detail-room__meta detail-room__meta--class">
              <span v-if="room.className">班级 {{ room.className }}</span>
              <span v-if="room.headTeacher">班主任 {{ room.headTeacher }}</span>
            </div>

            <div v-if="room" class="detail-tags">
              <span
                v-for="equipment in room.equipment"
                :key="equipment"
                class="tag-soft tag-soft--brand"
              >
                {{ equipment }}
              </span>
            </div>

            <div v-if="room" class="detail-free">
              <span class="detail-free__label">当天其他空闲</span>
              <div class="detail-free__tags">
                <span v-for="slot in otherFreeSlots" :key="slot.start" class="tag-soft tag-soft--teal">
                  {{ slot.start }}–{{ slot.end }}
                </span>
                <span v-if="!otherFreeSlots.length" class="t-xs faint">当天已排满</span>
              </div>
            </div>

            <el-button class="detail-room__btn" @click="goClassroom">
              按同等条件再找场所
              <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </SectionCard>

          <SectionCard title="申请人信息">
            <div class="detail-applicant">
              <UserAvatar
                class="detail-avatar"
                :name="app.applicant || '林小满'"
                :user-id="app.applicantId"
                :src="app.applicantAvatarUrl"
                :size="38"
              />
              <div class="grow">
                <strong>{{ app.applicant || '林小满' }}</strong>
                <p>{{ app.contact || '站内联系' }}</p>
              </div>
              <span class="tag-soft tag-soft--brand">学生</span>
            </div>
            <p class="detail-applicant__hint">如需修改申请，请先取消后重新提交。</p>
          </SectionCard>

          <SectionCard title="可用操作">
            <template v-if="canCancel || canReview">
              <div class="detail-actions">
                <el-button
                  v-if="canCancel"
                  class="detail-btn-cancel"
                  :loading="cancelLoading"
                  @click="cancelApplication"
                >
                  <el-icon v-if="!cancelLoading"><CircleClose /></el-icon>
                  取消申请
                </el-button>
                <template v-if="canReview">
                  <el-button
                    type="primary"
                    class="detail-btn-approve"
                    :loading="adminLoading"
                    @click="approve"
                  >
                    <el-icon v-if="!adminLoading"><CircleCheck /></el-icon>
                    审核通过
                  </el-button>
                  <el-button class="detail-btn-reject" @click="openReject">
                    <el-icon><Close /></el-icon>
                    驳回申请
                  </el-button>
                </template>
              </div>
              <p v-if="user.isAdmin" class="detail-admin-mode">
                <el-icon><UserFilled /></el-icon>
                当前以管理员身份操作
              </p>
            </template>
            <div v-else class="detail-closed">
              <p>
                {{ app.status === 'approved' ? '申请已通过，请按时使用场所并保持整洁。' : '该申请已关闭，如需使用场所请重新提交申请。' }}
              </p>
              <el-button type="primary" plain @click="goClassroom">
                <el-icon><School /></el-icon>
                重新借教室
              </el-button>
            </div>
          </SectionCard>
        </aside>
      </div>

      <p class="detail-foot">
        <el-icon :size="12"><InfoFilled /></el-icon>
        借用期间请遵守学校教室管理规定；AI 核验结果不替代管理员审核。
      </p>
    </template>

    <div v-else class="card detail-missing">
      <EmptyState
        title="找不到这条申请"
        :desc="`申请可能已被删除，或链接中的编号有误（${String(route.params.id)}）。`"
      >
        <template #icon>
          <span class="detail-missing__icon">
            <el-icon :size="24"><Warning /></el-icon>
          </span>
        </template>
        <el-button type="primary" @click="goStatus">
          <el-icon><ArrowLeft /></el-icon>
          返回我的申请
        </el-button>
        <el-button @click="goClassroom">去借教室</el-button>
      </EmptyState>
    </div>

    <el-dialog
      v-model="rejectVisible"
      title="驳回申请"
      width="min(480px, 94vw)"
      align-center
      append-to-body
    >
      <div class="reject-dialog">
        <p class="reject-dialog__desc">
          请填写驳回理由，申请人会在申请详情和消息通知中看到，方便调整后重新提交。
        </p>
        <el-input
          v-model="rejectReason"
          type="textarea"
          :rows="4"
          maxlength="80"
          show-word-limit
          placeholder="例如：该时段场地已有教学安排，建议改到 15:00 后"
        />
        <div class="chip-row reject-dialog__chips">
          <button
            v-for="reason in quickReasons"
            :key="reason"
            type="button"
            class="chip chip--sm"
            @click="rejectReason = reason"
          >
            {{ reason }}
          </button>
        </div>
      </div>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejecting" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: var(--content-max);
}

.detail-crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: -4px;
  font-size: 11px;
  color: var(--text-3);
}

.detail-crumb__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: color 0.2s var(--ease-out);
}

.detail-crumb__link:hover {
  color: var(--brand-600);
}

.detail-crumb__sep {
  color: var(--line-strong);
}

.detail-crumb__current {
  color: var(--text-2);
  font-weight: 600;
}

/* ---------- 状态横幅 ---------- */
.detail-banner {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 15px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.detail-banner.is-pending {
  border-color: var(--amber-100);
  background: linear-gradient(120deg, #fff7e6, #fffdf7);
}

.detail-banner.is-approved {
  border-color: var(--teal-100);
  background: linear-gradient(120deg, #e6faf7, #f7fffd);
}

.detail-banner.is-rejected {
  border-color: var(--coral-100);
  background: linear-gradient(120deg, #fff0f0, #fffafa);
}

.detail-banner.is-cancelled {
  border-color: var(--line);
  background: linear-gradient(120deg, #f3f4fa, #fafbff);
}

.detail-banner__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-2);
  box-shadow: var(--shadow-xs);
}

.is-pending .detail-banner__icon {
  color: var(--amber-600);
}

.is-approved .detail-banner__icon {
  color: var(--teal-600);
}

.is-rejected .detail-banner__icon {
  color: var(--coral-600);
}

.is-cancelled .detail-banner__icon {
  color: var(--text-3);
}

.detail-banner__title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-1);
}

.detail-banner__desc {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- 布局 ---------- */
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr);
  gap: 18px;
  align-items: start;
}

.detail-main,
.detail-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

/* ---------- 房间头 ---------- */
.detail-room-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.detail-room-art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  padding: 4px;
  flex: none;
  border-radius: 16px;
  text-align: center;
}

.detail-room-art span {
  position: relative;
  z-index: 1;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.25;
  word-break: break-word;
}

.detail-room-title {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 750;
  letter-spacing: -0.035em;
  color: var(--text-1);
}

.detail-room-sub {
  margin: 5px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.detail-rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 5px 9px;
  border-radius: var(--radius-pill);
  background: var(--amber-50);
  color: var(--amber-600);
  font-size: 11px;
  font-weight: 700;
}

/* ---------- 指标 ---------- */
.detail-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.detail-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 11px;
  background: var(--surface-2);
}

.detail-metric span {
  font-size: 10px;
  color: var(--text-3);
}

.detail-metric strong {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-1);
  letter-spacing: -0.01em;
}

.detail-note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 13px 0 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.6;
}

/* ---------- AI 核验 ---------- */
.detail-ai__summary {
  margin: 0;
  padding: 12px 14px;
  border: 1px dashed var(--brand-100);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(238, 236, 255, 0.55), rgba(230, 250, 247, 0.45));
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.detail-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.detail-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-2);
}

.detail-check__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 8px;
}

.detail-check.is-ok .detail-check__icon {
  background: var(--teal-50);
  color: var(--teal-600);
}

.detail-check.is-warn {
  border-color: var(--amber-100);
  background: var(--amber-50);
}

.detail-check.is-warn .detail-check__icon {
  background: var(--surface);
  color: var(--amber-600);
}

.detail-check strong {
  display: block;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-1);
}

.detail-check p {
  margin: 2px 0 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.detail-check__state {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  color: var(--teal-600);
}

.detail-check.is-warn .detail-check__state {
  color: var(--amber-600);
}

.detail-ai__notice {
  margin-top: 12px;
  font-size: 11px;
}

.detail-ai__foot {
  margin: 12px 0 0;
  font-size: 10px;
  color: var(--text-3);
  line-height: 1.55;
}

/* ---------- 时间线 ---------- */
.detail-timeline {
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}

.detail-timeline__item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 11px;
}

.detail-timeline__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.detail-timeline__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 23px;
  flex: none;
  border-radius: 50%;
}

.detail-timeline__dot.is-done {
  background: var(--teal-500);
  color: #fff;
  box-shadow: 0 4px 10px -5px rgba(18, 179, 166, 0.8);
}

.detail-timeline__dot.is-pending {
  border: 2px solid var(--amber-500);
  background: var(--amber-50);
}

.detail-timeline__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--amber-500);
  animation: timeline-pulse 1.6s ease-in-out infinite;
}

.detail-timeline__line {
  width: 2px;
  flex: 1;
  min-height: 18px;
  margin: 3px 0;
  border-radius: 2px;
  background: var(--line);
}

.detail-timeline__item.is-last .detail-timeline__line {
  display: none;
}

.detail-timeline__body {
  padding-bottom: 19px;
  min-width: 0;
}

.detail-timeline__item.is-last .detail-timeline__body {
  padding-bottom: 2px;
}

.detail-timeline__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.detail-timeline__head strong {
  font-size: 12px;
  font-weight: 680;
  color: var(--text-1);
}

.detail-timeline__head time {
  flex: none;
  font-size: 10px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.detail-timeline__body p {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

@keyframes timeline-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.4);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(245, 166, 35, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 166, 35, 0);
  }
}

/* ---------- 右栏教室 ---------- */
.detail-room {
  display: flex;
  align-items: center;
  gap: 11px;
}

.detail-room__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  padding: 3px;
  flex: none;
  border-radius: 12px;
  text-align: center;
}

.detail-room__art span {
  position: relative;
  z-index: 1;
  font-size: 10.5px;
  font-weight: 750;
  line-height: 1.2;
  word-break: break-word;
}

.detail-room h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-1);
}

.detail-room p {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: var(--text-3);
}

.detail-room__meta {
  display: flex;
  gap: 8px;
  margin-top: 11px;
  font-size: 10.5px;
  color: var(--text-2);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.detail-free {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
}

.detail-free__label {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  color: var(--text-3);
}

.detail-free__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.detail-room__btn {
  width: 100%;
  margin-top: 13px;
}

/* ---------- 申请人 ---------- */
.detail-applicant {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.detail-applicant strong {
  display: block;
  font-size: 12.5px;
  font-weight: 680;
  color: var(--text-1);
}

.detail-applicant p {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: var(--text-3);
}

.detail-applicant__hint {
  margin: 11px 0 0;
  font-size: 10px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- 操作 ---------- */
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.detail-actions :deep(.detail-btn-cancel) {
  border-color: var(--coral-100);
  background: var(--coral-50);
  color: var(--coral-600);
}

.detail-actions :deep(.detail-btn-cancel:hover) {
  border-color: var(--coral-500);
  background: var(--coral-50);
  color: var(--coral-600);
}

.detail-actions :deep(.detail-btn-reject) {
  border-color: transparent;
  background: linear-gradient(135deg, #ff6b6b, #e5484d);
  color: #fff;
  box-shadow: 0 8px 16px -10px rgba(229, 72, 77, 0.85);
}

.detail-actions :deep(.detail-btn-reject:hover) {
  border-color: transparent;
  color: #fff;
  transform: translateY(-1px);
}

.detail-admin-mode {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 10px 0 0;
  font-size: 10px;
  color: var(--text-3);
}

.detail-closed p {
  margin: 0 0 12px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.detail-closed :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.detail-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
  padding-top: 4px;
  font-size: 10px;
  color: var(--text-4);
}

/* ---------- 缺失 ---------- */
.detail-missing {
  padding: 12px;
}

.detail-missing__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 17px;
  background: var(--amber-50);
  color: var(--amber-600);
}

/* ---------- 驳回弹窗 ---------- */
.reject-dialog__desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-3);
}

.reject-dialog__chips {
  margin-top: 10px;
}

@media (max-width: 980px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .detail-side {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    align-items: start;
  }
}

@media (max-width: 700px) {
  .detail-banner {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 13px 14px;
  }

  .detail-banner :deep(.pill) {
    margin-left: 51px;
  }

  .detail-room-head {
    align-items: flex-start;
  }

  .detail-room-title {
    font-size: var(--fs-lg);
  }

  .detail-rating {
    display: none;
  }

  .detail-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-side {
    display: flex;
  }

  .detail-crumb {
    margin-top: 0;
  }
}

@media (max-width: 390px) {
  .detail-metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
