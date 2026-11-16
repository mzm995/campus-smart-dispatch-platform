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
import GroupBuyCommercePanel from './components/GroupBuyCommercePanel.vue'
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
const commerceStatus = computed(() =>
  item.value ? groupbuy.commerceStatusOf(item.value) : 'expired',
)
const commerceText = computed(() =>
  item.value ? groupbuy.commerceTextOf(item.value) : '已结束',
)
const viewer = computed(() => item.value?.viewer || {})
const myPickupTicket = computed(() => viewer.value.pickupTicket || null)
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
const commerceActing = ref(false)
const pickupTargetId = ref('')
const pickupCode = ref('')

const myCount = computed(() => {
  if (!item.value) return 0
  const found = (item.value.participants || []).find(
    (participant) =>
      participant.userId === user.user?.id || participant.name === me.value,
  )
  return found ? Number(found.count) || 1 : 0
})

const statusText = computed(() => {
  if (commerceStatus.value === 'formed') {
    return item.value?.commerce?.settlementMode === 'host_advance'
      ? '已满员，等待发起人代付采购'
      : '已满员，等待资金托管确认'
  }
  if (commerceStatus.value === 'funded') return '已满员，资金进入平台托管'
  if (['purchasing', 'shipping', 'ready', 'completed'].includes(commerceStatus.value)) {
    return commerceText.value
  }
  if (status.value === 'expired') return '已过截止时间'
  return `还差 ${remaining.value} 份成团`
})

const aiRemind = computed(() => {
  if (commerceStatus.value === 'completed') return '本单已完成，托管资金已结算。'
  if (commerceStatus.value === 'ready') return '商品已到领取点，请使用一次性取货码交接。'
  if (commerceStatus.value === 'formed' && item.value?.commerce?.settlementMode === 'host_advance') {
    return '拼单已成团，等待发起人代付采购，成员款项将在采购后进入托管。'
  }
  if (commerceStatus.value === 'funded') return '所有成员款项已进入托管，等待发起人采购。'
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

function moneyFromCents(value) {
  return (Math.max(0, Number(value) || 0) / 100).toFixed(2)
}

function backToList() {
  router.push({ path: '/groupbuy' })
}

async function handleJoin() {
  if (!item.value || acting.value) return
  if (commerceStatus.value !== 'recruiting') {
    ElMessage.warning('该拼单已结束，无法继续接龙')
    return
  }
  if (remaining.value <= 0) {
    ElMessage.warning('剩余份数不足，无法接龙')
    return
  }
  const amount = Math.min(Math.max(1, Number(count.value) || 1), remaining.value)
  acting.value = true
  try {
    await groupbuy.join(item.value.id, amount)
    count.value = 1
    if (['formed', 'funded'].includes(groupbuy.commerceStatusOf(item.value))) {
      ElMessage.success('接龙成功，已满员并完成资金托管')
    } else {
      ElMessage.success(`接龙成功，还差 ${groupbuy.remainingOf(item.value)} 份成团`)
    }
  } catch (error) {
    ElMessage.warning(error?.message || '接龙失败，请刷新后重试')
  } finally {
    acting.value = false
  }
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
  try {
    await groupbuy.leave(item.value.id, total)
    ElMessage.success('已取消接龙，冻结金额已释放')
  } catch (error) {
    ElMessage.warning(error?.message || '取消接龙失败')
  } finally {
    acting.value = false
  }
}

async function runErrandAction(action) {
  if (!item.value || errandActing.value) return null
  errandActing.value = true
  try {
    const result = await action(item.value.id)
    ElMessage.success('跑腿任务状态已更新')
    return result
  } catch (error) {
    ElMessage.warning(error?.message || '操作失败')
    return null
  } finally {
    errandActing.value = false
  }
}

async function handleAcceptErrand() {
  if (!item.value) return
  if (errandStatus.value !== 'open') {
    ElMessage.warning('该跑腿任务状态已变化，请刷新后重试')
    return
  }
  await runErrandAction(() => groupbuy.acceptErrand(item.value.id))
}

function handleCompleteErrand() {
  runErrandAction(() => groupbuy.completeErrand(item.value.id))
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
  runErrandAction(() => groupbuy.confirmErrand(item.value.id))
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
    await runErrandAction(() =>
      groupbuy.cancelErrandByOwner(item.value.id, value || '发起人取消跑腿任务'),
    )
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
    await runErrandAction(() =>
      groupbuy.withdrawErrand(item.value.id, value || '接单人暂时无法继续'),
    )
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
  commerceActing.value = true
  try {
    if (errand.value?.status === 'open') {
      await groupbuy.cancelErrandByOwner(item.value.id, '拼单已由发起人结束')
    }
    await groupbuy.cancelOrder(item.value.id, '发起人取消尚未成团的拼单')
    ElMessage.success('拼单已取消，预授权金额已释放')
  } catch (error) {
    ElMessage.warning(error?.message || '取消失败')
  } finally {
    commerceActing.value = false
  }
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
  try {
    await groupbuy.remove(item.value.id)
    ElMessage.success('拼单已删除')
    router.replace({ path: '/groupbuy' })
  } catch (error) {
    ElMessage.warning(error?.message || '删除失败')
  }
}

async function advanceCommerce(action) {
  if (!item.value || commerceActing.value) return
  commerceActing.value = true
  try {
    if (action === 'purchase') {
      await groupbuy.purchase(item.value.id, '平台演示采购凭证')
      ElMessage.success('已确认采购，托管资金仍将在全部领取后释放')
    } else if (action === 'ship') {
      await groupbuy.ship(item.value.id)
      ElMessage.success('已进入配送状态')
    } else if (action === 'ready') {
      await groupbuy.markReady(item.value.id, '商品已到达集中领取点')
      ElMessage.success('已标记到货，成员可取货')
    }
  } catch (error) {
    ElMessage.warning(error?.message || '操作失败')
  } finally {
    commerceActing.value = false
  }
}

async function redeemForMember() {
  if (!item.value || !pickupTargetId.value || !/^\d{6}$/.test(pickupCode.value)) {
    ElMessage.warning('请选择成员并输入对方提供的 6 位取货码')
    return
  }
  commerceActing.value = true
  try {
    await groupbuy.redeemPickup(item.value.id, pickupTargetId.value, pickupCode.value)
    pickupCode.value = ''
    ElMessage.success('已完成该成员取货核销')
  } catch (error) {
    ElMessage.warning(error?.message || '核销失败')
  } finally {
    commerceActing.value = false
  }
}

async function confirmMyPickup() {
  if (!item.value || !myPickupTicket.value?.code) return
  commerceActing.value = true
  try {
    await groupbuy.confirmReceived(item.value.id, myPickupTicket.value.code)
    ElMessage.success('已确认领取，托管资金将在全部交接后结算')
  } catch (error) {
    ElMessage.warning(error?.message || '确认领取失败')
  } finally {
    commerceActing.value = false
  }
}

async function openDispute() {
  if (!item.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '发起争议后相关托管资金会冻结，管理员核对领取与采购凭证后再处理。',
      '发起交易争议',
      {
        confirmButtonText: '提交争议',
        cancelButtonText: '取消',
        inputPlaceholder: '说明缺货、破损、未送达或金额问题',
        inputType: 'textarea',
      },
    )
    if (!String(value || '').trim()) {
      ElMessage.warning('请填写争议说明')
      return
    }
    await groupbuy.openDispute(item.value.id, value)
    ElMessage.success('争议已提交，相关资金已冻结')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.warning(error?.message || '提交争议失败')
    }
  }
}

async function resolveDispute(accepted) {
  if (!item.value?.dispute) return
  try {
    const { value } = await ElMessageBox.prompt(
      accepted
        ? '确认支持退款？相关托管资金将统一退回，已生成的取货码作废。'
        : '填写驳回争议的依据，托管资金将解除冻结。',
      accepted ? '支持退款' : '驳回争议',
      {
        confirmButtonText: accepted ? '确认退款' : '确认驳回',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '填写处理结论',
      },
    )
    if (!String(value || '').trim()) {
      ElMessage.warning('请填写处理结论')
      return
    }
    await groupbuy.resolveDispute(item.value.id, accepted, value)
    ElMessage.success('争议处理结果已记录')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.warning(error?.message || '处理争议失败')
    }
  }
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
                <StatusPill :status="status" :text="commerceText" />
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

            <template v-if="commerceStatus === 'recruiting'">
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
              <p class="action-pay-hint">
                预计冻结 <strong>¥{{ moneyFromCents(viewer.payableCents) }}</strong>
                （商品 + 已分摊配送/跑腿费），成团后转入平台托管。
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
                <strong>{{ commerceText }}</strong>
                <p v-if="['formed', 'funded'].includes(commerceStatus)">
                  已满 {{ item.targetCount }} 份，
                  {{
                    commerceStatus === 'formed' && item.commerce?.settlementMode === 'host_advance'
                      ? '等待发起人代付采购后再进入托管。'
                      : '成员资金已进入可追溯托管。'
                  }}
                </p>
                <p v-else-if="['purchasing', 'shipping', 'ready'].includes(commerceStatus)">
                  发起人正在推进采购与配送，状态更新会实时展示。
                </p>
                <p v-else>该拼单已结束，历史接龙与资金流水仍会保留。</p>
                <span v-if="myCount > 0" class="tag-soft tag-soft--teal">你已参与 {{ myCount }} 份</span>
              </div>
            </template>
          </section>

          <GroupBuyCommercePanel
            v-if="item.commerce"
            v-model:target-id="pickupTargetId"
            v-model:pickup-code="pickupCode"
            :item="item"
            :commerce-status="commerceStatus"
            :commerce-text="commerceText"
            :viewer="viewer"
            :is-owner="isOwner"
            :is-admin="user.isAdmin"
            :my-pickup-ticket="myPickupTicket"
            :acting="commerceActing"
            @advance="advanceCommerce"
            @redeem="redeemForMember"
            @confirm="confirmMyPickup"
            @dispute="openDispute"
            @resolve="resolveDispute"
          />

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
              <li :class="commerceStatus === 'recruiting' ? 'side-list__danger' : ''">
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
                <span>成员款项进入平台托管，取货核验完成后再结算。</span>
              </li>
              <li>
                <el-icon><Check /></el-icon>
                <span>不要绕过平台私下转账，金额或商品异常可立即发起争议。</span>
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
              <el-button
                :disabled="!['recruiting', 'formed', 'funded', 'expired'].includes(commerceStatus) || commerceActing"
                @click="handleEnd"
              >
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

<style scoped src="./GroupBuyDetailView.css"></style>
