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
  const found = (item.participants || []).find((p) => p.name === me.value)
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
  await new Promise((resolve) => setTimeout(resolve, 260))
  const result = groupbuy.join(item.id, 1)
  actingId.value = ''
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  if (groupbuy.statusOf(item) === 'success') ElMessage.success('接龙成功，已满员成团！')
  else ElMessage.success(`接龙成功，还差 ${groupbuy.remainingOf(item)} 份成团`)
}

async function actLeave(item) {
  if (actingId.value) return
  const mineCount = myCountOf(item)
  if (!mineCount) return
  actingId.value = item.id
  await new Promise((resolve) => setTimeout(resolve, 220))
  groupbuy.leave(item.id)
  actingId.value = ''
  if (mineCount > 1) ElMessage.success(`已取消 1 份，你还有 ${mineCount - 1} 份`)
  else ElMessage.success('已取消接龙')
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
  const created = await groupbuy.create({
    ...form,
    title: `${form.product.trim()}拼单，一起更划算`,
    tone: TONE_BY_CATEGORY[form.category] || 'brand',
    myCount: 1,
  })
  createOpen.value = false
  ElMessage.success('拼单已发布，去邀请同学接龙吧')
  if (created?.id) router.push(`/groupbuy/${created.id}`)
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
      eyebrow="SCENE 03 · 成团进度"
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
              <StatusPill :status="groupbuy.statusOf(item)" />
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
                {{ groupbuy.statusOf(item) === 'success' ? '已成团' : '已结束' }}
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

<style scoped>
.buy-page {
  gap: 20px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-actions :deep(.el-icon) {
  margin-right: 5px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 550;
}

.meta-pill .el-icon {
  font-size: 13px;
  color: var(--text-4);
}

.ai-notice {
  align-items: center;
}

.ai-notice__icon {
  font-size: 16px;
  flex: none;
}

.ai-notice__title {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
}

.ai-notice__text {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.9;
}

.ai-notice__close {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--brand-600);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.ai-notice__close:hover {
  background: var(--brand-100);
}

.buy-stats {
  gap: 14px;
}

/* ---------- 筛选 ---------- */
.filter-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
}

.filter-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-search {
  width: 100%;
  max-width: 360px;
}

.filter-scope {
  flex-wrap: nowrap;
}

.filter-count {
  margin-left: auto;
  font-size: 12px;
  white-space: nowrap;
}

.filter-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.filter-label {
  flex: none;
  width: 34px;
  padding-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.reset-link {
  margin-left: auto;
  padding: 6px 2px;
  border: none;
  background: none;
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.reset-link:hover {
  color: var(--brand-700);
}

/* ---------- 卡片网格 ---------- */
.buy-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

.buy-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out),
    border-color var(--dur) var(--ease-out);
}

.buy-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(90deg, var(--brand-500), transparent 72%);
  opacity: 0;
  transition: opacity var(--dur) var(--ease-out);
}

.buy-card--teal::before {
  background: linear-gradient(90deg, var(--teal-500), transparent 72%);
}

.buy-card--amber::before {
  background: linear-gradient(90deg, var(--amber-500), transparent 72%);
}

.buy-card--coral::before {
  background: linear-gradient(90deg, var(--coral-500), transparent 72%);
}

.buy-card--slate::before {
  background: linear-gradient(90deg, var(--line-strong), transparent 72%);
}

.buy-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--brand-200);
}

.buy-card:hover::before {
  opacity: 1;
}

.buy-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.buy-card__art {
  width: 54px;
  height: 54px;
  flex: none;
  border-radius: 16px;
  font-size: 22px;
  font-weight: 760;
  letter-spacing: -0.02em;
}

.buy-card__heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.buy-card__tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.buy-card__tags .tag-soft {
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
}

.buy-card__title {
  font-size: 14.5px;
  font-weight: 680;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--text-1);
  min-height: 42px;
}

.buy-card__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}

.buy-card__price {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.price {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  color: var(--text-1);
  font-size: 26px;
  font-weight: 760;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.price small {
  margin-right: 1px;
  font-size: 14px;
  font-weight: 650;
  color: var(--text-2);
}

.price em {
  margin-left: 4px;
  font-style: normal;
  font-size: 11px;
  font-weight: 550;
  color: var(--text-3);
  letter-spacing: 0;
}

.buy-card__target {
  font-size: 11.5px;
  color: var(--text-3);
}

.buy-bar {
  height: 6px;
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

.buy-card--teal .buy-bar i {
  background: linear-gradient(90deg, var(--teal-500), #4fdccf);
}

.buy-card--amber .buy-bar i {
  background: linear-gradient(90deg, var(--amber-500), #ffc766);
}

.buy-card--coral .buy-bar i {
  background: linear-gradient(90deg, var(--coral-500), #ff9f9f);
}

.buy-card--slate .buy-bar i {
  background: linear-gradient(90deg, #98a2bd, #c3cade);
}

.buy-card__progress {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.buy-card__pmeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-3);
}

.buy-card__pmeta strong {
  color: var(--text-2);
  font-weight: 700;
}

.buy-card__left {
  font-weight: 650;
  white-space: nowrap;
}

.buy-card__left.is-live {
  color: var(--amber-600);
}

.buy-card__left.is-success {
  color: var(--teal-600);
}

.buy-card__left.is-closed {
  color: var(--text-3);
}

.buy-card__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.meta-item .el-icon {
  flex: none;
  font-size: 13px;
  color: var(--text-4);
}

.buy-card__meta-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.errand-strip {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid rgba(245, 166, 35, 0.2);
  border-radius: 11px;
  background: linear-gradient(135deg, rgba(245, 166, 35, 0.09), rgba(255, 255, 255, 0.78));
}

.errand-strip.is-settled {
  border-color: rgba(18, 179, 166, 0.18);
  background: rgba(18, 179, 166, 0.06);
}

.errand-strip.is-cancelled {
  border-color: var(--line);
  background: var(--surface-2);
}

.errand-strip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  color: var(--amber-600);
  background: var(--surface);
  font-size: 14px;
}

.errand-strip__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.errand-strip__main strong {
  font-size: 10.5px;
  color: var(--text-1);
}

.errand-strip__main span {
  overflow: hidden;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}

.errand-strip__status {
  flex: none;
  font-size: 9.5px;
  font-weight: 650;
  color: var(--amber-600);
}

.errand-strip.is-settled .errand-strip__status {
  color: var(--teal-600);
}

.buy-card__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 11px;
  margin-top: auto;
  border-top: 1px dashed var(--line);
}

.buy-card__people {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.buy-card__people-text {
  font-size: 11px;
  white-space: nowrap;
}

.buy-card__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.buy-card__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.buy-card__actions :deep(.el-button.is-round) {
  font-size: 12px;
  padding-left: 13px;
  padding-right: 13px;
}

.buy-card.is-closed .buy-card__art {
  filter: grayscale(0.5);
  opacity: 0.78;
}

.buy-card.is-closed .buy-card__title,
.buy-card.is-closed .price {
  color: var(--text-2);
}

.empty-wrap {
  grid-column: 1 / -1;
  padding: 8px;
}

/* ---------- 玩法 ---------- */
.flow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.flow-step {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.flow-step__num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 700;
}

.flow-step__title {
  font-size: 13px;
  font-weight: 680;
  color: var(--text-1);
}

.flow-step__desc {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

/* ---------- 发起弹窗 ---------- */
.form-note {
  margin-bottom: 16px;
}

.form-note strong {
  font-size: 12.5px;
}

.form-note p {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.9;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.errand-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(245, 166, 35, 0.22);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(245, 166, 35, 0.08), rgba(255, 255, 255, 0.86));
}

.errand-editor__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.errand-editor__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 11px;
  color: var(--amber-600);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
}

.errand-editor__head > div {
  flex: 1;
  min-width: 0;
}

.errand-editor__head b {
  display: block;
  font-size: 12.5px;
  color: var(--text-1);
}

.errand-editor__head p {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-3);
}

.errand-editor :deep(.el-form-item) {
  margin-bottom: 0;
}

.errand-editor__amount {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-2);
}

.errand-editor__amount :deep(.el-input-number) {
  width: 126px;
}

.errand-editor__hint {
  font-size: 9.5px;
  font-weight: 400;
  color: var(--text-3);
}

.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-foot :deep(.el-button + .el-button) {
  margin-left: 0;
}

:global(.buy-dialog) {
  max-width: calc(100vw - 28px);
  border-radius: var(--radius-xl);
}

:global(.buy-dialog .el-dialog__header) {
  padding-bottom: 6px;
}

@media (max-width: 1180px) {
  .buy-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1000px) {
  .flow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .filter-search {
    max-width: none;
    flex: 1 1 220px;
  }

  .filter-count {
    margin-left: 0;
  }
}

@media (max-width: 760px) {
  .buy-grid {
    grid-template-columns: 1fr;
  }

  .buy-card__title {
    min-height: 0;
  }
}

@media (max-width: 640px) {
  .buy-page {
    gap: 16px;
  }

  .head-actions {
    width: 100%;
  }

  .head-actions :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }

  .meta-row {
    gap: 6px;
  }

  .filter-card {
    padding: 14px;
  }

  .filter-top {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .filter-search {
    flex: none;
    max-width: none;
  }

  .filter-scope {
    flex-wrap: wrap;
  }

  .filter-count {
    display: none;
  }

  .filter-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-label {
    width: 100%;
    padding-top: 0;
  }

  .reset-link {
    margin-left: 0;
  }

  .buy-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .buy-card {
    padding: 14px;
  }

  .buy-card__title {
    min-height: 0;
  }

  .flow-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .errand-editor__head {
    flex-wrap: wrap;
  }

  .errand-editor__head :deep(.el-switch) {
    width: 100%;
  }

  .errand-editor__amount :deep(.el-input-number) {
    width: 100%;
  }

  .dialog-foot {
    width: 100%;
  }

  .dialog-foot :deep(.el-button) {
    flex: 1;
  }
}
</style>
