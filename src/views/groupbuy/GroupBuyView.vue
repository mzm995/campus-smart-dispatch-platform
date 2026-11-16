<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Coin,
  Goods,
  Location,
  MagicStick,
  Plus,
  Promotion,
  Search,
  User,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import CountdownText from '@/components/CountdownText.vue'
import AvatarStack from '@/components/AvatarStack.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import { useGroupBuyStore } from '@/stores/groupbuy'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { groupbuyCategories } from '@/mock/seed'
import { fmtDateTime, formatMoney, initialOf } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const groupbuy = useGroupBuyStore()
const app = useAppStore()
const user = useUserStore()

const categories = groupbuyCategories
const SORTS = [
  { key: 'latest', label: '最新发布' },
  { key: 'deadline', label: '即将截止' },
  { key: 'hot', label: '最热接龙' },
]
const SCOPES = [
  { key: 'all', label: '全部拼单' },
  { key: 'mine', label: '我参与的' },
]
const FLOW = [
  { title: '发起拼单', desc: '填好商品、目标份数与截止时间，发布后自动生成接龙页。' },
  { title: '同学接龙', desc: '把页面分享到班群，进度条实时更新，满员会通知所有人。' },
  { title: '成团取货', desc: '按名单统一采购，到点在约定位置核销，省时也省钱。' },
  { title: '跑腿接单', desc: '附带小费的跑腿任务由其他同学接取，送达后发起人确认结算。' },
]
const TONE_SET = ['brand', 'teal', 'amber', 'coral', 'slate']
const TONE_BY_CATEGORY = { 饮品: 'amber', 餐饮: 'coral', 学习用品: 'brand', 生鲜水果: 'teal', 生活用品: 'slate', 活动物料: 'coral', 其他: 'slate' }
const CATEGORY_TONE = { 饮品: 'amber', 餐饮: 'coral', 学习用品: 'brand', 生鲜水果: 'teal', 生活用品: 'slate', 活动物料: 'coral' }

const sort = ref('latest')
const scope = ref('all')
const actingId = ref('')
const aiNotice = ref('')
const aiPrefill = ref(false)
const aiDeadlineHint = ref('')
const createOpen = ref(false)
const formRef = ref()
const lastSignature = ref('')

const me = computed(() => user.user?.name || '林小满')

const sorted = computed(() => {
  const base =
    scope.value === 'mine'
      ? groupbuy.filtered.filter((item) => groupbuy.isOwner(item) || groupbuy.isJoined(item))
      : groupbuy.filtered
  const list = [...base]
  if (sort.value === 'hot') {
    return list.sort((a, b) => groupbuy.joinedCountOf(b) - groupbuy.joinedCountOf(a))
  }
  if (sort.value === 'deadline') {
    const weight = { ongoing: 0, success: 1, expired: 2 }
    return list.sort((a, b) => {
      const wa = weight[groupbuy.statusOf(a)] ?? 3
      const wb = weight[groupbuy.statusOf(b)] ?? 3
      if (wa !== wb) return wa - wb
      return new Date(a.deadline) - new Date(b.deadline)
    })
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const hasFilters = computed(
  () =>
    Boolean(groupbuy.keyword.trim()) ||
    groupbuy.category !== '全部' ||
    scope.value !== 'all' ||
    sort.value !== 'latest',
)

const form = reactive({
  product: '',
  category: '饮品',
  unitPrice: 10,
  targetCount: 6,
  deadline: null,
  pickup: 'A栋一楼大厅',
  settlementMode: 'escrow',
  deliveryMode: 'central',
  deliveryFee: 0,
  note: '',
  title: '',
  myCount: 1,
  errandEnabled: false,
  errandTip: 5,
  errandDescription: '',
})

const rules = {
  product: [{ required: true, whitespace: true, message: '请填写商品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择商品分类', trigger: 'change' }],
  unitPrice: [{ required: true, message: '请填写单价', trigger: 'change' }],
  targetCount: [{ required: true, message: '请填写目标份数', trigger: 'change' }],
  deadline: [
    { required: true, message: '请选择截止时间', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (value && new Date(value).getTime() <= Date.now()) callback(new Error('截止时间需要晚于现在'))
        else callback()
      },
      trigger: 'change',
    },
  ],
  pickup: [{ required: true, whitespace: true, message: '请填写取货点', trigger: 'blur' }],
}

function toneOf(item) {
  return TONE_SET.includes(item.tone) ? item.tone : 'brand'
}

function mediaToneClass(item) {
  const tone = toneOf(item)
  return tone === 'brand' ? '' : `media-cover--${tone}`
}

function ringTone(item) {
  // 进度环只表达「成团状态」，不再复用分类色，避免和分类标签混淆
  const status = groupbuy.statusOf(item)
  if (status === 'success') return 'teal'
  if (status === 'expired') return 'slate'
  const { total } = groupbuy.countdownOf(item)
  return total > 0 && total < 6 * 60 * 60 * 1000 ? 'amber' : 'brand'
}

function categoryToneClass(category) {
  const tone = CATEGORY_TONE[category]
  return tone ? `tag-soft--${tone}` : ''
}

function memberCount(item) {
  return new Set((item.participants || []).map((p) => p.name)).size
}

function myCountOf(item) {
  const found = (item.participants || []).find(
    (participant) =>
      participant.userId === user.user?.id || participant.name === me.value,
  )
  return found ? Number(found.count) || 1 : 0
}

function leftText(item) {
  const status = groupbuy.statusOf(item)
  if (status === 'success') return '已满员成团'
  if (status === 'expired') return '已结束'
  const left = groupbuy.remainingOf(item)
  return left === 0 ? '已满员' : `还差 ${left} 份`
}

function leftTone(item) {
  const status = groupbuy.statusOf(item)
  if (status === 'success') return 'is-success'
  if (status === 'expired') return 'is-closed'
  return 'is-live'
}

function defaultDeadline() {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  date.setHours(20, 0, 0, 0)
  return date
}

function deadlineFromLabel(text) {
  const label = String(text || '')
  if (!label) return defaultDeadline()
  const date = new Date()
  date.setSeconds(0, 0)
  const week = label.match(/周([一二三四五六日天])/)
  if (week) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }
    let diff = (map[week[1]] - date.getDay() + 7) % 7
    if (diff === 0) diff = 7
    date.setDate(date.getDate() + diff)
  } else if (label.includes('明')) {
    date.setDate(date.getDate() + 1)
  }
  let hour = 20
  if (/上午|早上/.test(label)) hour = 10
  else if (/中午/.test(label)) hour = 12
  else if (/下午/.test(label)) hour = 17
  else if (/晚上/.test(label)) hour = 20
  date.setHours(hour, 0, 0, 0)
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1)
  return date
}

function isPastDate(date) {
  return date.getTime() < Date.now() - 86400000
}

function openAi() {
  if (typeof app.openAiDialog === 'function') {
    app.openAiDialog('我想发起一个拼单：东门快递驿站五层纸箱，单价 5 元，目标 8 个，取货点在宿舍楼下，明天下午。')
  }
}

function openCreate(prefill) {
  const data = prefill || {}
  const base = {
    product: '',
    category: '饮品',
    unitPrice: 10,
    targetCount: 6,
    deadline: defaultDeadline(),
    pickup: 'A栋一楼大厅',
    settlementMode: 'escrow',
    deliveryMode: 'central',
    deliveryFee: 0,
    note: '',
    title: '',
    myCount: 1,
    errandEnabled: false,
    errandTip: 5,
    errandDescription: '',
  }
  Object.assign(form, base)
  if (data.product != null) form.product = data.product
  if (data.price != null && data.price !== '') form.unitPrice = Number(data.price) || base.unitPrice
  if (data.target != null && data.target !== '') {
    form.targetCount = Math.min(999, Math.max(2, Number(data.target) || base.targetCount))
  }
  if (data.pickup) form.pickup = data.pickup
  if (data.category != null) form.category = data.category
  if (data.deadline) form.deadline = data.deadline
  aiPrefill.value = Boolean(data.ai)
  aiDeadlineHint.value = data.deadlineHint || ''
  createOpen.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function resetFilters() {
  groupbuy.keyword = ''
  groupbuy.category = '全部'
  scope.value = 'all'
  sort.value = 'latest'
}

async function actJoin(item) {
  if (actingId.value) return
  if (groupbuy.statusOf(item) !== 'ongoing') {
    ElMessage.warning('该拼单已结束')
    return
  }
  if (groupbuy.remainingOf(item) <= 0) {
    ElMessage.warning('剩余份数不足，无法接龙')
    return
  }
  actingId.value = item.id
  try {
    await groupbuy.join(item.id, 1)
    const current = groupbuy.getById(item.id) || item
    if (groupbuy.commerceStatusOf(current) === 'funded') {
      ElMessage.success('接龙成功，拼单已满员并完成资金托管')
    } else {
      ElMessage.success(`接龙成功，还差 ${groupbuy.remainingOf(current)} 份成团`)
    }
  } catch (error) {
    ElMessage.warning(error?.message || '接龙失败，请刷新后重试')
  } finally {
    actingId.value = ''
  }
}

async function actLeave(item) {
  if (actingId.value) return
  const mineCount = myCountOf(item)
  if (!mineCount) return
  actingId.value = item.id
  try {
    await groupbuy.leave(item.id, 1)
    if (mineCount > 1) ElMessage.success(`已取消 1 份，你还有 ${mineCount - 1} 份`)
    else ElMessage.success('已取消接龙，预授权金额已释放')
  } catch (error) {
    ElMessage.warning(error?.message || '取消接龙失败')
  } finally {
    actingId.value = ''
  }
}

async function submitCreate() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  if (form.errandEnabled && !String(form.errandDescription || '').trim()) {
    ElMessage.warning('请填写跑腿任务说明')
    return
  }
  try {
    const created = await groupbuy.create({
      ...form,
      title: `${form.product.trim()}拼单，一起更划算`,
      tone: TONE_BY_CATEGORY[form.category] || 'brand',
      myCount: 1,
    })
    createOpen.value = false
    ElMessage.success(
      form.settlementMode === 'host_advance'
        ? '拼单已发布，成团后由发起人代付采购并完成分账'
        : '拼单已发布，预计份额已冻结，成团后自动转入托管',
    )
    if (created?.id) router.push(`/groupbuy/${created.id}`)
  } catch (error) {
    ElMessage.error(error?.message || '创建拼单失败')
  }
}

function openDetail(item) {
  router.push(`/groupbuy/${item.id}`)
}

function readQueryText(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw ?? '').trim()
}

function handleQuery() {
  const query = route.query
  if (!query || !Object.keys(query).length) return
  if (query.create !== '1' && query.from !== 'ai') return
  if (createOpen.value) return

  const product = readQueryText(query.product)
  const price = readQueryText(query.price)
  const target = readQueryText(query.target)
  const pickup = readQueryText(query.pickup)
  const timeText = readQueryText(query.time)
  const signature = [product, price, target, pickup, timeText, query.create].join('|')
  if (signature === lastSignature.value) return
  lastSignature.value = signature

  if (query.create !== '1') {
    aiNotice.value = '已根据你的描述准备好拼单入口，点击「发起拼单」继续补充信息。'
    return
  }

  const deadline = deadlineFromLabel(timeText)
  openCreate({
    ai: true,
    product,
    price,
    target,
    pickup,
    category: '',
    deadline,
    deadlineHint: timeText ? `「${timeText}」→ ${fmtDateTime(deadline)}` : '',
  })

  const parts = [
    product ? `商品「${product}」` : '',
    price ? `单价 ¥${price}` : '',
    target ? `目标 ${target} 份` : '',
    pickup ? `取货点「${pickup}」` : '',
  ].filter(Boolean)
  const timeLine = timeText
    ? `截止时间按「${timeText}」暂定为 ${fmtDateTime(deadline)}`
    : `截止时间暂定为 ${fmtDateTime(deadline)}`
  aiNotice.value = `已按描述填入${parts.length ? `：${parts.join(' · ')}` : '基础信息'}；${timeLine}。分类请手动选择后发布。`

  nextTick(() => {
    if (route.query.create || route.query.from) router.replace({ path: route.path, query: {} })
  })
}

watch(() => route.query, handleQuery, { immediate: true })
</script>

<template>
  <div class="page buy-page">
    <PageHeader
      eyebrow="场景 03 · 成团进度"
      title="拼单集市"
      desc="发起拼单、接龙凑份数，成团自动提醒，到点一起取货。"
    >
      <template #actions>
        <div class="head-actions">
          <el-button plain @click="openAi">
            <el-icon><MagicStick /></el-icon>
            <span>AI 帮我发起</span>
          </el-button>
          <el-button type="primary" @click="openCreate()">
            <el-icon><Plus /></el-icon>
            <span>发起拼单</span>
          </el-button>
        </div>
      </template>
      <template #meta>
        <div class="meta-row">
          <span class="meta-pill"><el-icon><MagicStick /></el-icon>成团 / 截止前自动通知</span>
          <span class="meta-pill"><el-icon><Location /></el-icon>仅限校内 · 线下自提</span>
          <span class="meta-pill"><el-icon><CircleCheck /></el-icon>接龙进度实时同步</span>
        </div>
      </template>
    </PageHeader>

    <div v-if="aiNotice" class="notice ai-notice">
      <el-icon class="ai-notice__icon"><MagicStick /></el-icon>
      <div class="grow">
        <strong class="ai-notice__title">AI 已帮你预填发起表单</strong>
        <p class="ai-notice__text">{{ aiNotice }}</p>
      </div>
      <button type="button" class="ai-notice__close" aria-label="关闭提示" @click="aiNotice = ''">×</button>
    </div>

    <div class="grid g4 buy-stats">
      <StatTile label="进行中的拼单" :value="groupbuy.stats.ongoing" suffix="个" tone="brand" hint="正在接龙中" class="lift">
        <template #icon><el-icon><Promotion /></el-icon></template>
      </StatTile>
      <StatTile label="累计拼单" :value="groupbuy.stats.total" suffix="单" tone="teal" hint="含已成团与已结束">
        <template #icon><el-icon><Goods /></el-icon></template>
      </StatTile>
      <StatTile label="我参与的" :value="groupbuy.stats.joined" suffix="单" tone="amber" hint="发起与接龙都算">
        <template #icon><el-icon><User /></el-icon></template>
      </StatTile>
      <StatTile
        label="预计省下"
        :value="`¥${groupbuy.stats.saved}`"
        tone="coral"
        hint="按已参与拼单的均摊价估算"
      >
        <template #icon><el-icon><Coin /></el-icon></template>
      </StatTile>
    </div>

    <section class="card filter-card">
      <div class="filter-top">
        <el-input
          v-model="groupbuy.keyword"
          class="filter-search"
          clearable
          placeholder="搜索商品、标题或取货点…"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <div class="chip-row filter-scope">
          <button
            v-for="item in SCOPES"
            :key="item.key"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': scope === item.key }"
            @click="scope = item.key"
          >
            {{ item.label }}
          </button>
        </div>
        <span class="filter-count faint">共 {{ sorted.length }} 个</span>
      </div>

      <div class="filter-row">
        <span class="filter-label">分类</span>
        <div class="chip-row">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': groupbuy.category === category }"
            @click="groupbuy.category = category"
          >
            {{ category }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">排序</span>
        <div class="chip-row">
          <button
            v-for="item in SORTS"
            :key="item.key"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': sort === item.key }"
            @click="sort = item.key"
          >
            {{ item.label }}
          </button>
        </div>
        <button v-if="hasFilters" type="button" class="reset-link" @click="resetFilters">清空筛选</button>
      </div>
    </section>

    <section class="buy-grid" aria-label="拼单列表">
      <article
        v-for="item in sorted"
        :key="item.id"
        class="card buy-card"
        :class="[`buy-card--${toneOf(item)}`, { 'is-closed': groupbuy.statusOf(item) !== 'ongoing' }]"
      >
        <div class="buy-card__head">
          <span class="media-cover buy-card__art" :class="mediaToneClass(item)" aria-hidden="true">
            {{ initialOf(item.product || item.title) }}
          </span>
          <div class="buy-card__heading">
            <div class="buy-card__tags">
              <StatusPill
                :status="groupbuy.statusOf(item)"
                :text="groupbuy.commerceTextOf(item)"
              />
              <span class="tag-soft" :class="categoryToneClass(item.category)">{{ item.category }}</span>
              <span v-if="groupbuy.isOwner(item)" class="tag-soft tag-soft--brand">我发起的</span>
              <span v-else-if="groupbuy.isJoined(item)" class="tag-soft tag-soft--teal">我参与的</span>
              <span v-if="groupbuy.errandOf(item)" class="tag-soft tag-soft--amber">
                <el-icon><Coin /></el-icon>
                跑腿 +¥{{ Number(groupbuy.errandOf(item).tip || 0).toFixed(2) }}
              </span>
            </div>
            <h3 class="buy-card__title clamp-2" :title="item.title">{{ item.title }}</h3>
          </div>
        </div>

        <div class="buy-card__summary">
          <div class="buy-card__price">
            <span class="price">
              <small>¥</small><span class="mono">{{ formatMoney(item.unitPrice) }}</span><em>/ 份</em>
            </span>
            <span class="buy-card__target">目标 {{ item.targetCount }} 份</span>
          </div>
          <ProgressRing :value="groupbuy.progressOf(item)" :size="54" :stroke="5" :tone="ringTone(item)" />
        </div>

        <div class="buy-card__progress">
          <div
            class="buy-bar"
            role="progressbar"
            :aria-valuenow="groupbuy.progressOf(item)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <i :style="{ width: `${groupbuy.progressOf(item)}%` }" />
          </div>
          <div class="buy-card__pmeta">
            <span>
              已接龙 <strong class="mono">{{ groupbuy.joinedCountOf(item) }}</strong> / 目标
              <strong class="mono">{{ item.targetCount }}</strong> 份
            </span>
            <span class="buy-card__left" :class="leftTone(item)">{{ leftText(item) }}</span>
          </div>
        </div>

        <div class="buy-card__meta">
          <span class="meta-item">
            <el-icon><Location /></el-icon>
            <span class="truncate">{{ item.pickup }}</span>
          </span>
          <div class="buy-card__meta-split">
            <span class="meta-item">
              <el-icon><User /></el-icon>
              <span class="truncate">发起人 · {{ item.owner }}</span>
            </span>
            <CountdownText :target="item.deadline" prefix="距截止" compact />
          </div>
        </div>

        <div v-if="groupbuy.errandOf(item)" class="errand-strip" :class="`is-${groupbuy.errandStatusOf(item)}`">
          <span class="errand-strip__icon"><el-icon><Promotion /></el-icon></span>
          <div class="errand-strip__main">
            <strong>跑腿任务 · 小费 ¥{{ Number(groupbuy.errandOf(item).tip || 0).toFixed(2) }}</strong>
            <span>{{ groupbuy.errandOf(item).description }}</span>
          </div>
          <span class="errand-strip__status">
            {{
              groupbuy.errandStatusOf(item) === 'open'
                ? '待接单'
                : groupbuy.errandStatusOf(item) === 'accepted'
                  ? '进行中'
                  : groupbuy.errandStatusOf(item) === 'delivered'
                    ? '待确认'
                    : groupbuy.errandStatusOf(item) === 'settled'
                      ? '已结算'
                      : '已取消'
            }}
          </span>
        </div>

        <div class="buy-card__foot">
          <div class="buy-card__people">
            <AvatarStack :names="item.participants" :size="26" :max="4" />
            <span class="buy-card__people-text faint">{{ memberCount(item) }} 人参与</span>
          </div>
          <div class="buy-card__actions">
            <el-button text size="small" @click="openDetail(item)">详情</el-button>
            <template v-if="groupbuy.statusOf(item) !== 'ongoing'">
              <el-button size="small" round disabled>
                {{ groupbuy.commerceTextOf(item) }}
              </el-button>
            </template>
            <template v-else-if="groupbuy.isJoined(item)">
              <el-button
                size="small"
                round
                plain
                :loading="actingId === item.id"
                @click="actLeave(item)"
              >
                已接龙 {{ myCountOf(item) }} 份 · 取消
              </el-button>
            </template>
            <template v-else>
              <el-button
                size="small"
                round
                type="primary"
                :loading="actingId === item.id"
                @click="actJoin(item)"
              >
                立即接龙
              </el-button>
            </template>
          </div>
        </div>
      </article>

      <div v-if="!sorted.length" class="card empty-wrap">
        <EmptyState
          :title="hasFilters ? '没有符合条件的拼单' : '还没有拼单'"
          :desc="
            hasFilters
              ? '换个关键词或分类试试，也可以自己发起一单。'
              : '发起第一单，把想买的同学聚到一起，满员自动通知。'
          "
        >
          <el-button v-if="hasFilters" @click="resetFilters">清空筛选</el-button>
          <el-button v-else type="primary" @click="openCreate()">发起第一个拼单</el-button>
        </EmptyState>
      </div>
    </section>

    <SectionCard title="拼单怎么玩" desc="三步把零散需求凑成一单，进度和提醒交给 AI。">
      <template #actions>
        <AiBadge text="成团 / 截止自动提醒" ghost small />
      </template>
      <div class="flow-grid">
        <div v-for="(step, index) in FLOW" :key="step.title" class="flow-step">
          <span class="flow-step__num mono">0{{ index + 1 }}</span>
          <div>
            <div class="flow-step__title">{{ step.title }}</div>
            <p class="flow-step__desc">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </SectionCard>

    <el-dialog
      v-model="createOpen"
      class="buy-dialog"
      width="560px"
      title="发起拼单"
      align-center
      append-to-body
      :close-on-click-modal="false"
      :close-on-press-escape="!groupbuy.creating"
      :show-close="!groupbuy.creating"
    >
      <div class="notice form-note">
        <el-icon><MagicStick /></el-icon>
        <div>
          <strong>{{ aiPrefill ? '来自 AI 的预填' : '拼单说明' }}</strong>
          <p v-if="aiPrefill">
            已按你的描述填入{{ aiDeadlineHint ? `，截止时间${aiDeadlineHint}` : '' }}；分类需手动确认后发布。
          </p>
          <p v-else>填好商品与目标份数，发布后把页面分享给同学接龙，满员会自动通知。</p>
        </div>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        require-asterisk-position="right"
      >
        <el-form-item label="商品名称" prop="product">
          <el-input
            v-model="form.product"
            placeholder="例如：快递纸箱 / 珍珠奶茶"
            maxlength="24"
            show-word-limit
          />
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="分类" prop="category">
            <el-select v-model="form.category" placeholder="请选择分类" style="width: 100%">
              <el-option
                v-for="category in categories.filter((c) => c !== '全部')"
                :key="category"
                :label="category"
                :value="category"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="单价（元）" prop="unitPrice">
            <el-input-number
              v-model="form.unitPrice"
              :min="0.1"
              :max="9999"
              :precision="1"
              :step="1"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="目标份数" prop="targetCount">
            <el-input-number
              v-model="form.targetCount"
              :min="2"
              :max="999"
              :step="1"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="截止时间" prop="deadline">
            <el-date-picker
              v-model="form.deadline"
              type="datetime"
              placeholder="选择截止时间"
              :disabled-date="isPastDate"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <el-form-item label="取货点" prop="pickup">
          <el-input v-model="form.pickup" maxlength="40" placeholder="例如：A栋一楼大厅" />
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="履约方式">
            <el-select v-model="form.deliveryMode" style="width: 100%">
              <el-option label="集中送到楼栋大厅" value="central" />
              <el-option label="宿舍楼下分批配送" value="dorm" />
              <el-option label="商家 / 驿站自取" value="self" />
              <el-option label="指定中间人分发" value="proxy" />
            </el-select>
          </el-form-item>
          <el-form-item label="结算方式">
            <el-select v-model="form.settlementMode" style="width: 100%">
              <el-option label="成员预付托管（推荐）" value="escrow" />
              <el-option label="发起人代付后分账" value="host_advance" />
            </el-select>
          </el-form-item>
          <el-form-item label="配送费（全单）">
            <el-input-number
              v-model="form.deliveryFee"
              :min="0"
              :max="500"
              :precision="2"
              :step="1"
              controls-position="right"
            />
          </el-form-item>
        </div>

        <div class="notice notice--teal escrow-notice">
          <el-icon><Coin /></el-icon>
          <span>
            {{
              form.settlementMode === 'host_advance'
                ? '发起人先代付采购，成团后成员款项进入托管，全部领取完成后再向发起人分账；发生争议时资金冻结。'
                : '接龙时冻结预计份额，成团后扣款进入平台托管；未成团自动释放，完成领取后再结算。'
            }}
          </span>
        </div>

        <el-form-item label="备注" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="3"
            maxlength="120"
            show-word-limit
            placeholder="口味、规格、取货时间等（选填）"
          />
        </el-form-item>

        <div class="errand-editor">
          <div class="errand-editor__head">
            <span class="errand-editor__icon"><el-icon><Promotion /></el-icon></span>
            <div>
              <b>附加跑腿任务</b>
              <p>其他同学可接单完成取货或配送，小费在发起人确认完成后结算。</p>
            </div>
            <el-switch v-model="form.errandEnabled" active-text="需要跑腿" inactive-text="不需要" />
          </div>
          <template v-if="form.errandEnabled">
            <el-form-item label="跑腿任务说明" required>
              <el-input
                v-model="form.errandDescription"
                type="textarea"
                :rows="2"
                maxlength="100"
                show-word-limit
                placeholder="例如：成团后帮忙从东门取货并送到 A栋一楼大厅"
              />
            </el-form-item>
            <div class="errand-editor__amount">
              <span>跑腿小费</span>
              <el-input-number
                v-model="form.errandTip"
                :min="0.01"
                :max="200"
                :precision="2"
                :step="1"
                controls-position="right"
              />
              <span class="errand-editor__hint">接单后才能开始；取消或异常时不会结算。</span>
            </div>
          </template>
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-foot">
          <el-button :disabled="groupbuy.creating" @click="createOpen = false">取消</el-button>
          <el-button type="primary" :loading="groupbuy.creating" @click="submitCreate">
            {{ groupbuy.creating ? '发布中…' : '发布拼单' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped src="./GroupBuyView.css"></style>
