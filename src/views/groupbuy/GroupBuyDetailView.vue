<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  CircleCheck,
  Coin,
  Delete,
  Flag,
  InfoFilled,
  Location,
  Lock,
  MagicStick,
  Promotion,
  ShoppingCart,
  SwitchButton,
  User,
  Warning,
} from '@element-plus/icons-vue'
import StatusPill from '@/components/StatusPill.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import CountdownText from '@/components/CountdownText.vue'
import AvatarStack from '@/components/AvatarStack.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useGroupBuyStore } from '@/stores/groupbuy'
import { useUserStore } from '@/stores/user'
import { fmtDateTime, formatMoney, initialOf } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const groupbuy = useGroupBuyStore()
const user = useUserStore()

const TONE_SET = ['brand', 'teal', 'amber', 'coral', 'slate']
const CATEGORY_TONE = { 饮品: 'amber', 餐饮: 'coral', 学习用品: 'brand', 生鲜水果: 'teal', 生活用品: 'slate', 活动物料: 'coral' }

const count = ref(1)
const acting = ref(false)
const fromAi = ref(route.query.from === 'ai')

const me = computed(() => user.user?.name || '林小满')
const item = computed(() => groupbuy.getById(route.params.id))
const status = computed(() => (item.value ? groupbuy.statusOf(item.value) : 'expired'))
const joined = computed(() => (item.value ? groupbuy.joinedCountOf(item.value) : 0))
const remaining = computed(() => (item.value ? groupbuy.remainingOf(item.value) : 0))
const progress = computed(() => (item.value ? groupbuy.progressOf(item.value) : 0))
const maxJoin = computed(() => Math.max(1, remaining.value))
const isOwner = computed(() => (item.value ? groupbuy.isOwner(item.value) : false))
const isJoined = computed(() => (item.value ? groupbuy.isJoined(item.value) : false))
const errand = computed(() => (item.value ? groupbuy.errandOf(item.value) : null))
const errandStatus = computed(() => (item.value ? groupbuy.errandStatusOf(item.value) : ''))
const isErrandRunner = computed(() => (item.value ? groupbuy.isErrandRunner(item.value) : false))
const canAcceptErrand = computed(() => (item.value ? groupbuy.canAcceptErrand(item.value) : false))
const errandActing = ref(false)

const myCount = computed(() => {
  if (!item.value) return 0
  const found = (item.value.participants || []).find((p) => p.name === me.value)
  return found ? Number(found.count) || 1 : 0
})

const statusText = computed(() => {
  if (status.value === 'success') return '已满员成团'
  if (status.value === 'expired') return '已过截止时间'
  return `还差 ${remaining.value} 份成团`
})

const aiRemind = computed(() => {
  if (status.value === 'success') return '本单已成团，取货提醒已发送给所有参与者。'
  if (status.value === 'expired') return '本单已结束，历史接龙记录仍会保留。'
  return `还剩 ${remaining.value} 份，满 ${item.value?.targetCount || 0} 份自动成团。`
})

const memberRows = computed(() => {
  if (!item.value) return []
  return (item.value.participants || []).map((person) => ({
    name: person.name,
    userId: person.userId || '',
    avatarUrl: person.avatarUrl || '',
    count: Number(person.count) || 1,
    at: person.at,
    isMe: person.name === me.value,
    isOwner: person.name === item.value.owner,
  }))
})

function toneOf(value) {
  return TONE_SET.includes(value.tone) ? value.tone : 'brand'
}

function mediaToneClass(value) {
  const tone = toneOf(value)
  return tone === 'brand' ? '' : `media-cover--${tone}`
}

function ringTone(value) {
  const tone = toneOf(value)
  return ['teal', 'amber', 'coral'].includes(tone) ? tone : 'brand'
}

function categoryToneClass(category) {
  const tone = CATEGORY_TONE[category]
  return tone ? `tag-soft--${tone}` : ''
}

function joinTime(row) {
  if (row.at) return fmtDateTime(row.at)
  return row.isOwner ? '发起时加入' : '—'
}

function backToList() {
  router.push({ path: '/groupbuy' })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handleJoin() {
  if (!item.value || acting.value) return
  if (status.value !== 'ongoing') {
    ElMessage.warning('该拼单已结束，无法继续接龙')
    return
  }
  if (remaining.value <= 0) {
    ElMessage.warning('剩余份数不足，无法接龙')
    return
  }
  const amount = Math.min(Math.max(1, Number(count.value) || 1), remaining.value)
  acting.value = true
  await wait(420)
  const result = groupbuy.join(item.value.id, amount)
  acting.value = false
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  count.value = 1
  if (groupbuy.statusOf(item.value) === 'success') ElMessage.success('接龙成功，已满员成团！')
  else ElMessage.success(`接龙成功，还差 ${groupbuy.remainingOf(item.value)} 份成团`)
}

async function handleLeaveAll() {
  if (!item.value || acting.value || !myCount.value) return
  try {
    await ElMessageBox.confirm(
      `确定取消你已接龙的 ${myCount.value} 份吗？取消后份数会释放给其他同学。`,
      '取消接龙',
      { confirmButtonText: '确定取消', cancelButtonText: '再想想', type: 'warning' },
    )
  } catch {
    return
  }
  const total = myCount.value
  acting.value = true
  await wait(320)
  for (let index = 0; index < total; index += 1) groupbuy.leave(item.value.id)
  acting.value = false
  ElMessage.success('已取消接龙')
}

function runErrandAction(action, successPrefix = '') {
  if (!item.value || errandActing.value) return null
  errandActing.value = true
  const result = action(item.value.id)
  errandActing.value = false
  if (!result.ok) {
    ElMessage.warning(result.message)
    return null
  }
  ElMessage.success(successPrefix ? `${successPrefix}${result.message}` : result.message)
  return result
}

async function handleAcceptErrand() {
  if (!item.value) return
  if (errandStatus.value !== 'open') {
    ElMessage.warning('该跑腿任务状态已变化，请刷新后重试')
    return
  }
  await wait(260)
  runErrandAction(groupbuy.acceptErrand, '')
}

function handleCompleteErrand() {
  runErrandAction(groupbuy.completeErrand, '')
}

async function handleConfirmErrand() {
  if (!item.value || errandStatus.value !== 'delivered') return
  try {
    await ElMessageBox.confirm(
      `确认跑腿任务已经完成，并向 ${errand.value?.runnerName || '接单人'} 结算 ¥${Number(errand.value?.tip || 0).toFixed(2)} 小费？`,
      '确认完成并结算',
      {
        confirmButtonText: '确认结算',
        cancelButtonText: '再检查一下',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  runErrandAction(groupbuy.confirmErrand)
}

async function handleCancelErrand() {
  if (!item.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '取消后跑腿任务将终止，已接单的同学会收到通知。',
      '取消跑腿任务',
      {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputPlaceholder: '取消原因（选填）',
        inputValue: '发起人调整了取货安排',
      },
    )
    runErrandAction((id) => groupbuy.cancelErrandByOwner(id, value || '发起人取消跑腿任务'))
  } catch {
    // 用户取消操作。
  }
}

async function handleWithdrawErrand() {
  if (!item.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '退出后任务会重新开放给其他同学接取。',
      '退出跑腿任务',
      {
        confirmButtonText: '确认退出',
        cancelButtonText: '继续配送',
        inputPlaceholder: '退出原因（选填）',
        inputValue: '临时有事，暂时无法继续',
      },
    )
    runErrandAction((id) => groupbuy.withdrawErrand(id, value || '接单人暂时无法继续'))
  } catch {
    // 用户取消操作。
  }
}

async function handleEnd() {
  if (!item.value) return
  if (errand.value && ['accepted', 'delivered'].includes(errandStatus.value)) {
    ElMessage.warning('跑腿任务正在执行，请先完成确认或取消跑腿任务')
    return
  }
  try {
    await ElMessageBox.confirm(
      '结束后将无法继续接龙，已参与的成员记录会保留。确定结束这次拼单吗？',
      '结束拼单',
      { confirmButtonText: '确定结束', cancelButtonText: '再想想', type: 'warning' },
    )
  } catch {
    return
  }
  if (errand.value?.status === 'open') {
    groupbuy.cancelErrandByOwner(item.value.id, '拼单已由发起人结束')
  }
  item.value.deadline = new Date(Date.now() - 60000).toISOString()
  ElMessage.success('拼单已结束')
}

async function handleRemove() {
  if (!item.value) return
  if (errand.value && ['accepted', 'delivered'].includes(errandStatus.value)) {
    ElMessage.warning('跑腿任务正在执行，暂不能删除拼单')
    return
  }
  try {
    await ElMessageBox.confirm(
      '删除后不可恢复，参与者也将无法再看到这条拼单。确定删除吗？',
      '删除拼单',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  groupbuy.remove(item.value.id)
  ElMessage.success('拼单已删除')
  router.replace({ path: '/groupbuy' })
}

watch(remaining, (value) => {
  const max = Math.max(1, value)
  if (count.value > max) count.value = max
})

watch(
  () => route.params.id,
  () => {
    count.value = 1
    acting.value = false
    fromAi.value = route.query.from === 'ai'
  },
)

watch(
  () => route.query.from,
  (value) => {
    fromAi.value = value === 'ai'
  },
)
</script>

<template>
  <div class="page detail-page">
    <div class="crumb-bar">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/groupbuy' }">拼单集市</el-breadcrumb-item>
        <el-breadcrumb-item>拼单详情</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="crumb-bar__right">
        <span v-if="item" class="faint crumb-created">创建于 {{ fmtDateTime(item.createdAt) }}</span>
        <el-button text @click="backToList">
          <el-icon><ArrowLeft /></el-icon>
          返回集市
        </el-button>
      </div>
    </div>

    <template v-if="!item">
      <div class="card empty-wrap">
        <EmptyState
          title="拼单不存在或已被删除"
          desc="链接可能已经过期，去集市看看其他正在接龙的拼单吧。"
        >
          <el-button type="primary" @click="backToList">返回拼单集市</el-button>
        </EmptyState>
      </div>
    </template>

    <template v-else>
      <div v-if="fromAi" class="notice ai-banner">
        <el-icon class="ai-banner__icon"><InfoFilled /></el-icon>
        <div class="grow">
          <strong>AI 已按你的描述整理了这笔拼单</strong>
          <p>请核对商品、单价、目标份数与截止时间；确认无误后分享给同学接龙。</p>
        </div>
        <el-button text @click="fromAi = false">知道了</el-button>
      </div>

      <div class="detail-grid">
        <section class="card hero-card" :class="`tone-${toneOf(item)}`">
          <div class="hero-head">
            <span class="media-cover hero-art" :class="mediaToneClass(item)" aria-hidden="true">
              {{ initialOf(item.product || item.title) }}
            </span>
            <div class="hero-intro">
              <div class="hero-tags">
                <StatusPill :status="status" />
                <span class="tag-soft" :class="categoryToneClass(item.category)">{{ item.category }}</span>
                <span v-if="isOwner" class="tag-soft tag-soft--brand">我发起的</span>
                <span v-else-if="isJoined" class="tag-soft tag-soft--teal">我参与的</span>
              </div>
              <h1 class="hero-title">{{ item.title }}</h1>
              <p class="hero-sub">
                {{ item.product }} · 发起人 {{ item.owner }} · {{ item.pickup }}
              </p>
            </div>
            <ProgressRing
              class="hero-ring"
              :value="progress"
              :size="86"
              :stroke="8"
              :tone="ringTone(item)"
              caption="成团进度"
            />
          </div>

          <div class="hero-facts">
            <div class="fact">
              <span>单价</span>
              <strong class="price-fact"><small>¥</small>{{ formatMoney(item.unitPrice) }}<em>/ 份</em></strong>
            </div>
            <div class="fact">
              <span>目标份数</span>
              <strong>{{ item.targetCount }} <em>份</em></strong>
            </div>
            <div class="fact">
              <span>已接龙</span>
              <strong>{{ joined }} <em>份</em></strong>
            </div>
            <div class="fact" :class="remaining > 0 ? 'fact--amber' : 'fact--teal'">
              <span>剩余份数</span>
              <strong>{{ remaining }} <em>份</em></strong>
            </div>
          </div>

          <div class="hero-progress">
            <div class="hero-progress__head">
              <span>成团进度</span>
              <strong class="mono">{{ progress }}%</strong>
            </div>
            <div class="buy-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
              <i :style="{ width: `${progress}%` }" />
            </div>
          </div>

          <div class="hero-info">
            <div class="info-row">
              <el-icon><Location /></el-icon>
              <span class="info-label">取货点</span>
              <span class="info-value">{{ item.pickup }}</span>
            </div>
            <div class="info-row">
              <el-icon><Calendar /></el-icon>
              <span class="info-label">截止时间</span>
              <span class="info-value mono">{{ fmtDateTime(item.deadline) }}</span>
              <CountdownText :target="item.deadline" prefix="距截止" compact />
            </div>
            <div class="info-row">
              <el-icon><User /></el-icon>
              <span class="info-label">发起人</span>
              <span class="info-value">{{ item.owner }}</span>
              <span v-if="isOwner" class="tag-soft tag-soft--brand">本人</span>
            </div>
          </div>

          <div class="hero-note">
            <span class="hero-note__label">发起人备注</span>
            <p>{{ item.note || '发起人暂未留下备注，接龙后可在群里沟通规格与取货细节。' }}</p>
          </div>
        </section>

        <aside class="detail-side">
          <section class="card side-card action-card">
            <div class="side-head">
              <span class="side-head__icon side-head__icon--brand"><ShoppingCart /></span>
              <div>
                <h2>接龙操作</h2>
                <p>{{ statusText }}</p>
              </div>
            </div>

            <template v-if="status === 'ongoing'">
              <div class="action-people">
                <AvatarStack :names="item.participants" :size="26" :max="5" />
                <span>{{ joined }} 份已被接龙</span>
              </div>

              <div class="action-field">
                <span class="action-field__label">接龙份数</span>
                <el-input-number
                  v-model="count"
                  :min="1"
                  :max="maxJoin"
                  :step="1"
                  step-strictly
                  controls-position="right"
                />
              </div>

              <p class="action-hint">
                你已参与 <strong class="mono">{{ myCount }}</strong> 份 · 还差
                <strong class="mono">{{ remaining }}</strong> 份成团
              </p>

              <el-button
                type="primary"
                size="large"
                class="action-btn"
                :loading="acting"
                :disabled="remaining === 0"
                @click="handleJoin"
              >
                立即接龙
              </el-button>
              <el-button
                v-if="myCount > 0"
                text
                class="action-cancel"
                :disabled="acting"
                @click="handleLeaveAll"
              >
                取消接龙
              </el-button>
            </template>

            <template v-else>
              <div class="action-closed">
                <el-icon class="action-closed__icon">
                  <CircleCheck v-if="status === 'success'" />
                  <Lock v-else />
                </el-icon>
                <strong>{{ status === 'success' ? '已成团' : '已结束' }}</strong>
                <p v-if="status === 'success'">已满 {{ item.targetCount }} 份，等待发起人统一采购。</p>
                <p v-else>该拼单已过截止时间，无法继续接龙。</p>
                <span v-if="myCount > 0" class="tag-soft tag-soft--teal">你已参与 {{ myCount }} 份</span>
              </div>
            </template>
          </section>

          <section v-if="errand" class="card side-card errand-card">
            <div class="side-head">
              <span class="side-head__icon side-head__icon--amber"><Promotion /></span>
              <div>
                <h2>跑腿任务</h2>
                <p>小费 ¥{{ Number(errand.tip || 0).toFixed(2) }} · 已完成后结算</p>
              </div>
              <span class="errand-state" :class="`is-${errandStatus}`">
                {{
                  errandStatus === 'open'
                    ? '待接单'
                    : errandStatus === 'accepted'
                      ? '进行中'
                      : errandStatus === 'delivered'
                        ? '待确认'
                        : errandStatus === 'settled'
                          ? '已结算'
                          : '已取消'
                }}
              </span>
            </div>

            <div class="errand-task">
              <span class="errand-task__icon"><el-icon><Coin /></el-icon></span>
              <div>
                <strong>{{ errand.description }}</strong>
                <span v-if="errand.runnerName">接单人：{{ errand.runnerName }}</span>
                <span v-else>还没有同学接取，完成任务可获得小费。</span>
              </div>
            </div>

            <div class="errand-timeline">
              <span class="is-done">发布</span>
              <i></i>
              <span :class="{ 'is-done': ['accepted', 'delivered', 'settled'].includes(errandStatus) }">接单</span>
              <i></i>
              <span :class="{ 'is-done': ['delivered', 'settled'].includes(errandStatus) }">送达</span>
              <i></i>
              <span :class="{ 'is-done': errandStatus === 'settled' }">结算</span>
            </div>

            <div v-if="errandStatus === 'open'" class="errand-actions">
              <template v-if="isOwner">
                <p>等待其他同学接单。发起人不能接取自己的跑腿任务。</p>
                <el-button plain @click="handleCancelErrand">取消跑腿</el-button>
              </template>
              <template v-else>
                <p>接单后请按说明完成取货或配送，送达后由发起人确认结算。</p>
                <el-button
                  type="primary"
                  :disabled="!canAcceptErrand"
                  :loading="errandActing"
                  @click="handleAcceptErrand"
                >
                  接取跑腿任务 · 赚 ¥{{ Number(errand.tip || 0).toFixed(2) }}
                </el-button>
              </template>
            </div>

            <div v-else-if="errandStatus === 'accepted'" class="errand-actions">
              <template v-if="isErrandRunner">
                <p>完成任务后点击“已送达”，等待发起人确认。确认前请勿删除任务记录。</p>
                <div class="row gap-2 wrap">
                  <el-button plain :disabled="errandActing" @click="handleWithdrawErrand">退出跑腿</el-button>
                  <el-button type="primary" :loading="errandActing" @click="handleCompleteErrand">
                    已送达，等待确认
                  </el-button>
                </div>
              </template>
              <template v-else-if="isOwner">
                <p>{{ errand.runnerName }} 正在进行跑腿。如遇特殊情况可取消任务，取消后不结算小费。</p>
                <el-button plain @click="handleCancelErrand">取消跑腿任务</el-button>
              </template>
              <p v-else>该任务已被 {{ errand.runnerName }} 接取，其他同学暂时不能接单。</p>
            </div>

            <div v-else-if="errandStatus === 'delivered'" class="errand-actions">
              <template v-if="isOwner">
                <p>接单人已标记送达，请核对物品后确认完成。确认后将记录小费结算。</p>
                <el-button type="primary" :loading="errandActing" @click="handleConfirmErrand">
                  确认完成并结算 ¥{{ Number(errand.tip || 0).toFixed(2) }}
                </el-button>
              </template>
              <p v-else-if="isErrandRunner">已送达，等待发起人确认并结算小费。</p>
              <p v-else>任务已送达，等待发起人确认。</p>
            </div>

            <div v-else-if="errandStatus === 'settled'" class="errand-result is-success">
              <el-icon><CircleCheck /></el-icon>
              <div>
                <strong>跑腿任务已完成</strong>
                <span>¥{{ Number(errand.settledAmount || errand.tip || 0).toFixed(2) }} 小费已记录结算。</span>
              </div>
            </div>

            <div v-else-if="errandStatus === 'cancelled'" class="errand-result">
              <el-icon><InfoFilled /></el-icon>
              <div>
                <strong>跑腿任务已取消</strong>
                <span>{{ errand.cancelReason || '该任务不再接受接单。' }}</span>
              </div>
            </div>
          </section>

          <section class="card side-card ai-card">
            <div class="side-head">
              <span class="side-head__icon side-head__icon--teal"><MagicStick /></span>
              <div>
                <h2>AI 自动提醒</h2>
                <p>成团 / 截止前自动通知</p>
              </div>
            </div>
            <ul class="side-list">
              <li>
                <el-icon><Check /></el-icon>
                <span>接龙满员时，立即通知所有参与者。</span>
              </li>
              <li>
                <el-icon><Bell /></el-icon>
                <span>截止前自动提醒还没满员的拼单。</span>
              </li>
              <li :class="status === 'ongoing' ? 'side-list__danger' : ''">
                <el-icon><Warning /></el-icon>
                <span>{{ aiRemind }}</span>
              </li>
            </ul>
            <div class="ai-card__foot">
              <AiBadge text="通知由 AI 调度" ghost small />
              <span class="faint">重要消息红色标记</span>
            </div>
          </section>

          <section class="card side-card safety-card">
            <div class="side-head">
              <span class="side-head__icon side-head__icon--slate"><Lock /></span>
              <div>
                <h2>安全提示</h2>
                <p>校园内线下交易更放心</p>
              </div>
            </div>
            <ul class="side-list side-list--check">
              <li>
                <el-icon><Check /></el-icon>
                <span>仅限校内同学参与，请勿邀请校外人员。</span>
              </li>
              <li>
                <el-icon><Check /></el-icon>
                <span>线下当面交易，取货时先验货再付款。</span>
              </li>
              <li>
                <el-icon><Check /></el-icon>
                <span>不要提前转账给陌生同学，异常情况及时联系辅导员。</span>
              </li>
            </ul>
          </section>

          <section v-if="isOwner" class="card side-card owner-card">
            <div class="side-head">
              <span class="side-head__icon side-head__icon--amber"><Flag /></span>
              <div>
                <h2>发起人操作</h2>
                <p>你是本次拼单的发起人</p>
              </div>
            </div>
            <p class="owner-tip">成团后请及时统一采购；结束或删除后，其他同学将无法继续接龙。</p>
            <div class="owner-actions">
              <el-button :disabled="status !== 'ongoing'" @click="handleEnd">
                <el-icon><SwitchButton /></el-icon>
                结束拼单
              </el-button>
              <el-button type="danger" plain @click="handleRemove">
                <el-icon><Delete /></el-icon>
                删除拼单
              </el-button>
            </div>
          </section>
        </aside>

        <section class="card members-card">
          <header class="members-head">
            <div class="members-head__title">
              <h2>参与成员</h2>
              <span class="tag-soft tag-soft--brand">{{ memberRows.length }} 人</span>
            </div>
            <span class="faint">共 {{ joined }} / {{ item.targetCount }} 份</span>
          </header>

          <div class="members-table">
            <div class="members-table__head">
              <span>成员</span>
              <span class="members-table__count">份数</span>
              <span class="members-table__time">接龙时间</span>
            </div>
            <div v-for="row in memberRows" :key="`${row.name}-${row.count}`" class="member-row">
              <div class="member-user">
                <UserAvatar
                  class="member-avatar"
                  :name="row.name"
                  :user-id="row.userId"
                  :src="row.avatarUrl"
                  :size="30"
                />
                <div class="member-id">
                  <span class="member-name">
                    {{ row.name }}
                    <span v-if="row.isMe" class="tag-soft tag-soft--brand">本人</span>
                    <span v-else-if="row.isOwner" class="tag-soft">发起人</span>
                  </span>
                  <span class="member-time-mobile">{{ joinTime(row) }}</span>
                </div>
              </div>
              <span class="member-count mono">{{ row.count }} 份</span>
              <span class="member-time">{{ joinTime(row) }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  gap: 16px;
}

.crumb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.crumb-bar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.crumb-created {
  font-size: 11.5px;
}

.crumb-bar :deep(.el-breadcrumb__inner) {
  font-weight: 550;
}

.crumb-bar__right :deep(.el-icon) {
  margin-right: 4px;
}

.ai-banner {
  align-items: center;
}

.ai-banner__icon {
  flex: none;
  font-size: 16px;
}

.ai-banner strong {
  font-size: 12.5px;
}

.ai-banner p {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.9;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  grid-template-areas:
    'hero side'
    'members side';
  gap: 18px;
  align-items: start;
}

/* ---------- 主卡 ---------- */
.hero-card {
  grid-area: hero;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.hero-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.hero-art {
  width: 76px;
  height: 76px;
  flex: none;
  border-radius: 20px;
  font-size: 30px;
  font-weight: 760;
  letter-spacing: -0.02em;
}

.hero-intro {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.hero-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.hero-tags .tag-soft {
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
}

.hero-title {
  font-size: 24px;
  font-weight: 760;
  line-height: 1.32;
  letter-spacing: -0.03em;
  color: var(--text-1);
}

.hero-sub {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}

.hero-ring {
  flex: none;
}

.hero-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
  min-width: 0;
}

.fact span {
  font-size: 11.5px;
  color: var(--text-3);
}

.fact strong {
  font-size: 19px;
  font-weight: 740;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fact strong em {
  margin-left: 2px;
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0;
}

.fact--amber strong {
  color: var(--amber-600);
}

.fact--teal strong {
  color: var(--teal-600);
}

.price-fact small {
  margin-right: 1px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-2);
}

.price-fact em {
  font-size: 11px;
}

.hero-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-progress__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--text-3);
}

.hero-progress__head strong {
  font-size: 14px;
  color: var(--text-1);
}

.buy-bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  overflow: hidden;
}

.buy-bar i {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--brand-500), #948cff);
  transition: width var(--dur-slow) var(--ease-out);
}

.tone-teal .buy-bar i {
  background: linear-gradient(90deg, var(--teal-500), #4fdccf);
}

.tone-amber .buy-bar i {
  background: linear-gradient(90deg, var(--amber-500), #ffc766);
}

.tone-coral .buy-bar i {
  background: linear-gradient(90deg, var(--coral-500), #ff9f9f);
}

.tone-slate .buy-bar i {
  background: linear-gradient(90deg, #98a2bd, #c3cade);
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0;
  border-top: 1px dashed var(--line);
  border-bottom: 1px dashed var(--line);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-2);
}

.info-row .el-icon {
  flex: none;
  font-size: 14px;
  color: var(--text-4);
}

.info-label {
  flex: none;
  width: 58px;
  font-size: 12px;
  color: var(--text-3);
}

.info-value {
  color: var(--text-1);
  font-weight: 600;
}

.hero-note {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.hero-note__label {
  flex: none;
  padding-top: 1px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
}

/* ---------- 侧栏 ---------- */
.detail-side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.side-card {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 18px;
}

.side-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.side-head__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 16px;
}

.side-head__icon--brand {
  background: var(--brand-50);
  color: var(--brand-600);
}

.side-head__icon--teal {
  background: var(--teal-50);
  color: var(--teal-600);
}

.side-head__icon--amber {
  background: var(--amber-50);
  color: var(--amber-600);
}

.side-head__icon--slate {
  background: var(--surface-3);
  color: var(--text-2);
}

.side-head h2 {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-1);
}

.side-head p {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}

.action-people {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 12px;
  color: var(--text-3);
}

.action-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-field__label {
  flex: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
}

.action-field :deep(.el-input-number) {
  max-width: 160px;
}

.action-hint {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.action-hint strong {
  color: var(--text-1);
}

.action-btn {
  width: 100%;
}

.action-btn :deep(span),
.action-cancel :deep(span) {
  letter-spacing: 0.02em;
}

.action-cancel {
  width: 100%;
  margin-left: 0;
}

.action-people :deep(.stack__item) {
  border-color: var(--surface-2);
}

.action-closed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px 8px;
  text-align: center;
}

.action-closed__icon {
  font-size: 34px;
  color: var(--text-4);
}

.action-closed strong {
  font-size: 16px;
  font-weight: 740;
  color: var(--text-1);
}

.action-closed p {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.ai-card {
  background: linear-gradient(160deg, #fbfaff 0%, #ffffff 42%);
}

.side-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.side-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
}

.side-list li .el-icon {
  flex: none;
  margin-top: 2px;
  font-size: 14px;
  color: var(--teal-600);
}

.side-list__danger,
.side-list__danger .el-icon {
  color: var(--coral-600) !important;
  font-weight: 600;
}

.side-list--check li .el-icon {
  color: var(--brand-500);
}

.ai-card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}

.ai-card__foot .faint {
  font-size: 10.5px;
  margin-left: auto;
}

.owner-tip {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.owner-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.owner-actions :deep(.el-button) {
  margin-left: 0;
}

.owner-actions :deep(.el-icon) {
  margin-right: 4px;
}

/* ---------- 成员 ---------- */
.members-card {
  grid-area: members;
  padding: 20px;
}

.members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.members-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-head h2 {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.members-head .faint {
  font-size: 11.5px;
}

.members-table {
  display: flex;
  flex-direction: column;
}

.members-table__head {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 70px 120px;
  gap: 10px;
  padding: 0 10px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
}

.members-table__count {
  text-align: right;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 70px 120px;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-bottom: 1px dashed var(--line);
}

.member-row:last-child {
  border-bottom: none;
}

.member-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.member-avatar {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  box-shadow: var(--shadow-xs);
}

.member-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.member-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 640;
  color: var(--text-1);
  flex-wrap: wrap;
}

.member-name .tag-soft {
  height: 19px;
  padding: 0 7px;
  font-size: 10px;
}

.member-time-mobile {
  display: none;
  font-size: 11px;
  color: var(--text-3);
}

.member-count {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-2);
  text-align: right;
  white-space: nowrap;
}

.member-time {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.empty-wrap {
  padding: 8px;
}

.side-head > div {
  flex: 1;
  min-width: 0;
}

.errand-state {
  flex: none;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  color: var(--amber-700);
  background: var(--amber-50);
  font-size: 9.5px;
  font-weight: 700;
}

.errand-state.is-settled {
  color: var(--teal-700);
  background: var(--teal-50);
}

.errand-state.is-cancelled {
  color: var(--text-3);
  background: var(--surface-3);
}

.errand-task {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(245, 166, 35, 0.18);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(245, 166, 35, 0.08), rgba(255, 255, 255, 0.7));
}

.errand-task__icon {
  color: var(--amber-600);
  font-size: 16px;
}

.errand-task > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.errand-task strong {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-1);
}

.errand-task span {
  font-size: 10px;
  color: var(--text-3);
}

.errand-timeline {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto 1fr auto;
  align-items: center;
  gap: 6px;
}

.errand-timeline span {
  font-size: 9px;
  color: var(--text-4);
  white-space: nowrap;
}

.errand-timeline span.is-done {
  color: var(--teal-600);
  font-weight: 700;
}

.errand-timeline i {
  height: 1px;
  background: var(--line);
}

.errand-actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
}

.errand-actions p {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--text-3);
}

.errand-actions :deep(.el-button) {
  margin-left: 0;
}

.errand-result {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 11px;
  background: var(--surface-2);
  color: var(--text-3);
}

.errand-result.is-success {
  color: var(--teal-600);
  background: var(--teal-50);
}

.errand-result > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.errand-result strong {
  font-size: 11.5px;
  color: var(--text-1);
}

.errand-result span {
  font-size: 10px;
  line-height: 1.5;
}

@media (max-width: 1180px) {
  .hero-title {
    font-size: 21px;
  }

  .hero-art {
    width: 68px;
    height: 68px;
    font-size: 26px;
    border-radius: 18px;
  }
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'hero'
      'side'
      'members';
  }
}

@media (max-width: 640px) {
  .detail-page {
    gap: 12px;
  }

  .crumb-created {
    display: none;
  }

  .detail-grid {
    gap: 12px;
  }

  .hero-card {
    gap: 14px;
    padding: 16px;
  }

  .hero-head {
    gap: 12px;
  }

  .hero-art {
    width: 58px;
    height: 58px;
    border-radius: 16px;
    font-size: 23px;
  }

  .hero-title {
    font-size: 19px;
  }

  .hero-ring {
    display: none;
  }

  .hero-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .fact {
    padding: 10px 12px;
  }

  .fact strong {
    font-size: 17px;
  }

  .hero-note {
    flex-direction: column;
    gap: 4px;
  }

  .side-card {
    padding: 16px;
  }

  .members-card {
    padding: 16px;
  }

  .members-table__head {
    display: none;
  }

  .member-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'user count'
      'time count';
    gap: 4px 10px;
    padding: 11px 12px;
    border-bottom: none;
    border-radius: 12px;
    background: var(--surface-2);
    margin-bottom: 8px;
  }

  .member-user {
    grid-area: user;
  }

  .member-count {
    grid-area: count;
    align-self: center;
  }

  .member-time {
    grid-area: time;
    padding-left: 42px;
    font-size: 11px;
  }

  .member-time-mobile {
    display: none;
  }
}
</style>
