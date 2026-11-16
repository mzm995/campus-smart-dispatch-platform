<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  Clock,
  Coin,
  Connection,
  Delete,
  InfoFilled,
  Location,
  Lock,
  MagicStick,
  Plus,
  Refresh,
  Search,
  Timer,
  Wallet,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import LostFoundSupportPanel from './components/LostFoundSupportPanel.vue'
import { useLostfoundStore } from '@/stores/lostfound'
import { lostfoundCategories } from '@/mock/seed'
import { sleep } from '@/utils/aiEngine'
import { timeAgo } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const store = useLostfoundStore()
const { keyword, typeFilter, categoryFilter, filtered, topPairs, openCount, resolvedCount } = storeToRefs(store)

const loading = ref(true)
const refreshing = ref(false)
const rematching = ref(false)
const dialogVisible = ref(false)
const detailId = ref('')
const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)

const typeTabs = computed(() => [
  { key: 'all', label: '全部', count: store.posts.length },
  { key: 'lost', label: '寻物', count: store.lostPosts.length },
  { key: 'found', label: '招领', count: store.foundPosts.length },
])

const hasFilter = computed(
  () =>
    Boolean(keyword.value.trim()) ||
    typeFilter.value !== 'all' ||
    categoryFilter.value !== '全部类别',
)

const matchCounts = computed(() => {
  const map = {}
  store.posts.forEach((post) => {
    map[post.id] = store.matchesFor(post.id).length
  })
  return map
})

const detail = computed(() => store.posts.find((post) => post.id === detailId.value) || null)
const detailMatches = computed(() => (detail.value ? store.matchesFor(detail.value.id) : []))
const detailCanManage = computed(() => Boolean(detail.value && store.canManage(detail.value)))
const detailIsLost = computed(() => detail.value?.type === 'lost')
const detailIsFound = computed(() => detail.value?.type === 'found')
const detailReward = computed(() => (detail.value ? store.rewardOf(detail.value) : { enabled: false, amount: 0 }))
const detailClaims = computed(() => (detail.value ? store.claimsOf(detail.value) : []))
const foundClaims = computed(() => detailClaims.value.filter((claim) => claim.kind === 'found_claim'))
const detailIsOwner = computed(() => Boolean(detail.value && store.isOwner(detail.value)))
const myDetailClaim = computed(() => (detail.value ? store.myActiveClaim(detail.value) : null))
const myFoundClaim = computed(() =>
  foundClaims.value.find(
    (claim) => ['submitted', 'approved'].includes(claim.status),
  ) || null,
)
const claimableLostPosts = computed(() => store.myLostPosts || [])
const dialogWidth = computed(() => (viewportWidth.value < 720 ? '92vw' : '680px'))

const claimDialogVisible = ref(false)
const claimMode = ref('clue')
const claimSubmitting = ref(false)
const claimForm = reactive({
  description: '',
  contact: '站内联系',
})
const rewardDialogVisible = ref(false)
const rewardTarget = ref(null)
const rewardAmount = ref(0)
const foundClaimDialogVisible = ref(false)
const foundClaimSubmitting = ref(false)
const foundClaimForm = reactive({
  lostPostId: '',
  description: '',
  contact: '站内联系',
})

const STATUS_TEXT = {
  open: '进行中',
  matching: '匹配中',
  claimed_pending: '认领待确认',
  resolved: '已完成',
}
const STATUS_TONE = { open: 'amber', matching: 'brand', claimed_pending: 'amber', resolved: 'teal' }

const FALLBACK_CASES = [
  {
    id: 'case-cup',
    icon: '杯',
    tone: 'teal',
    title: '蓝色保温杯 · A栋',
    meta: '2 小时内完成认领',
    quote: '杯盖磕碰和贴纸位置完全一致，核对后当场领回。',
    reward: 10,
  },
  {
    id: 'case-card',
    icon: '卡',
    tone: 'brand',
    title: '校园卡 · 食堂门口',
    meta: '当天完成归还',
    quote: '拾得者先提交归还说明，失主确认后无需打赏直接领取。',
    reward: 0,
  },
]

const pendingClaimCount = computed(() =>
  store.posts.reduce(
    (sum, post) =>
      sum +
      (Array.isArray(post.claims)
        ? post.claims.filter((claim) => ['submitted', 'approved'].includes(claim.status)).length
        : 0),
    0,
  ),
)
const rewardPostCount = computed(
  () => store.lostPosts.filter((post) => post.status !== 'resolved' && store.rewardOf(post).enabled).length,
)
const resolvedCases = computed(() => {
  const actual = store.posts
    .filter((post) => post.status === 'resolved')
    .slice(0, 2)
    .map((post, index) => ({
      id: post.id,
      icon: post.item?.slice(0, 1) || String(index + 1),
      tone: index % 2 === 0 ? 'teal' : 'brand',
      title: post.title.replace(/^【[^】]+】/, ''),
      meta: `${post.place} · ${timeAgo(post.resolvedAt || post.createdAt)}完成`,
      quote: post.type === 'lost' ? '寻物信息已完成认领。' : '物品已由失主确认领取。',
      reward: store.rewardOf(post).amount,
    }))
  return actual.length ? actual : FALLBACK_CASES
})
const usingFallbackCases = computed(
  () => !store.posts.some((post) => post.status === 'resolved'),
)

function statusText(post) {
  return STATUS_TEXT[post?.status] || '进行中'
}

function statusTone(post) {
  return STATUS_TONE[post?.status] || 'slate'
}

function claimStatusText(status) {
  return {
    submitted: '等待发布者确认',
    rewarded: '已打赏',
    picked_up: '已自行领取',
    cancelled: '已取消',
    approved: '认领已通过',
    rejected: '认领未通过',
    claimed: '已认领',
  }[status] || '处理中'
}

function goPublish(type = 'lost') {
  router.push({ path: '/lostfound/publish', query: { type } })
}

function contactTip() {
  ElMessage({
    type: 'warning',
    message: '联系方式默认脱敏，仅站内可见',
    grouping: true,
    duration: 2400,
  })
}

function openDetail(post) {
  if (!post) return
  detailId.value = post.id
  dialogVisible.value = true
}

function switchDetail(post) {
  if (post) detailId.value = post.id
}

function openClaim(mode = 'clue') {
  if (!detail.value || detail.value.type !== 'lost') return
  claimMode.value = mode
  claimForm.description = ''
  claimForm.contact = '站内联系'
  claimDialogVisible.value = true
}

async function submitClaim() {
  if (!detail.value || claimSubmitting.value) return
  claimSubmitting.value = true
  await sleep(260)
  const result = store.submitClaim(detail.value.id, {
    mode: claimMode.value,
    description: claimForm.description,
    contact: claimForm.contact,
  })
  claimSubmitting.value = false
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  claimDialogVisible.value = false
  ElMessage.success(result.message)
}

function openReward(claim) {
  if (!detail.value || !claim) return
  rewardTarget.value = claim
  rewardAmount.value = Number(detail.value.rewardAmount) || 10
  rewardDialogVisible.value = true
}

function submitReward() {
  if (!detail.value || !rewardTarget.value) return
  const result = store.rewardClaim(detail.value.id, rewardTarget.value.id, rewardAmount.value)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  rewardDialogVisible.value = false
  ElMessage.success(result.message)
}

async function confirmPickup(claim) {
  if (!detail.value || !claim) return
  try {
    await ElMessageBox.confirm(
      `确认你已通过 ${claim.helperName} 提供的方式完成领取？确认后本次寻物将结束。`,
      '确认自行领取',
      {
        confirmButtonText: '确认已领取',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  const result = store.confirmSelfPickup(detail.value.id, claim.id)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  ElMessage.success(result.message)
}

function cancelClaim(claim) {
  if (!detail.value || !claim) return
  const result = store.cancelClaim(detail.value.id, claim.id)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  ElMessage.success(result.message)
}

function openFoundClaim() {
  if (!detail.value || detail.value.type !== 'found') return
  if (!claimableLostPosts.value.length) {
    ElMessage.warning('请先发布一条仍在寻找中的寻物信息，再发起认领')
    return
  }
  const matchedLost = detailMatches.value
    .map((item) => item.post)
    .find((post) => post.type === 'lost' && claimableLostPosts.value.some((mine) => mine.id === post.id))
  foundClaimForm.lostPostId = matchedLost?.id || claimableLostPosts.value[0]?.id || ''
  foundClaimForm.description = ''
  foundClaimForm.contact = '站内联系'
  foundClaimDialogVisible.value = true
}

async function submitFoundClaim() {
  if (!detail.value || foundClaimSubmitting.value) return
  foundClaimSubmitting.value = true
  await sleep(260)
  const result = store.claimFoundItem(detail.value.id, foundClaimForm)
  foundClaimSubmitting.value = false
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  foundClaimDialogVisible.value = false
  ElMessage.success(result.message)
}

async function reviewFoundClaim(claim, approved) {
  if (!detail.value || !claim) return
  try {
    await ElMessageBox.confirm(
      approved
        ? `确认 ${claim.claimantName} 的物品归属说明无误？通过后对方需要确认领取${claim.rewardEnabled ? `并打赏 ¥${Number(claim.rewardAmount).toFixed(2)}` : ''}。`
        : `驳回 ${claim.claimantName} 的认领申请？`,
      approved ? '通过认领申请' : '驳回认领申请',
      {
        confirmButtonText: approved ? '通过申请' : '确认驳回',
        cancelButtonText: '取消',
        type: approved ? 'success' : 'warning',
      },
    )
  } catch {
    return
  }
  const result = store.reviewFoundClaim(detail.value.id, claim.id, approved)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  ElMessage.success(result.message)
}

function completeFoundClaim(claim) {
  if (!detail.value || !claim) return
  const result = store.completeFoundClaim(detail.value.id, claim.id)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return
  }
  ElMessage.success(result.message)
}

async function refreshMatch() {
  refreshing.value = true
  await sleep(700)
  refreshing.value = false
  ElMessage.success(`匹配已刷新，当前有 ${topPairs.value.length} 组高相似线索`)
}

function markResolved() {
  if (!detail.value) return
  if (!store.resolve(detail.value.id)) {
    ElMessage.warning('只能由发布者或管理员更新这条信息')
    return
  }
  ElMessage.success('已标记完成，感谢你的帮助')
}

async function markReopen() {
  if (!detail.value) return
  if (!detailCanManage.value) {
    ElMessage.warning('只能由发布者或管理员更新这条信息')
    return
  }
  rematching.value = true
  await sleep(520)
  store.reopen(detail.value.id)
  rematching.value = false
  ElMessage.success('已重新加入匹配队列，AI 会继续比对线索')
}

async function removePost() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `「${detail.value.title}」删除后将不再参与 AI 匹配，且无法恢复。`,
      '确认删除这条信息？',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '再想想',
        confirmButtonClass: 'el-button--danger',
      },
    )
    if (!store.remove(detail.value.id)) {
      ElMessage.warning('只能由发布者或管理员删除这条信息')
      return
    }
    dialogVisible.value = false
    ElMessage.success('信息已删除')
  } catch {
    // 用户取消，不做任何处理
  }
}

function clearFilters() {
  store.resetFilters()
}

function onResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  if (route.query.from === 'ai') {
    router.replace({ path: '/lostfound/publish', query: { ...route.query } })
    return
  }
  window.setTimeout(() => {
    loading.value = false
  }, 420)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="失物招领广场"
      eyebrow="SCENE 02 · 双向匹配"
      desc="一条寻物、一条招领，AI 在后台做双向特征比对。物品、颜色、地点、时间，都可能是找回它的关键。"
    >
      <template #meta>
        <div class="head-meta">
          <span class="tag-soft tag-soft--teal">
            <span class="dot"></span>AI 双向匹配运行中
          </span>
          <span class="tag-soft">
            <el-icon><Connection /></el-icon>{{ topPairs.length }} 组高相似线索
          </span>
          <span class="t-xs faint">已比对 {{ store.posts.length }} 条广场信息</span>
        </div>
      </template>
      <template #actions>
        <el-button :icon="Search" @click="goPublish('lost')">发布寻物</el-button>
        <el-button type="primary" :icon="Plus" @click="goPublish('found')">发布招领</el-button>
      </template>
    </PageHeader>

    <div class="grid g3 lf-stats">
      <StatTile label="进行中" :value="openCount" suffix="条" hint="等待线索或认领中" tone="brand" compact>
        <template #icon><el-icon><Timer /></el-icon></template>
      </StatTile>
      <StatTile label="已完成" :value="resolvedCount" suffix="条" hint="已成功找回 / 认领" tone="teal" compact>
        <template #icon><el-icon><CircleCheck /></el-icon></template>
      </StatTile>
      <StatTile label="AI 匹配" :value="topPairs.length" suffix="组" hint="相似度 ≥ 55% 的双向线索" tone="amber" compact>
        <template #icon><el-icon><Connection /></el-icon></template>
      </StatTile>
    </div>

    <div class="grid g-7-5 lf-main">
      <!-- 左侧：信息流 -->
      <div class="lf-feed">
        <div class="card lf-filter">
          <div class="lf-tabs-wrap">
            <div class="lf-tabs" role="tablist" aria-label="信息类型">
              <button
                v-for="tab in typeTabs"
                :key="tab.key"
                type="button"
                class="lf-tab"
                :class="{ 'is-active': typeFilter === tab.key }"
                role="tab"
                :aria-selected="typeFilter === tab.key"
                @click="typeFilter = tab.key"
              >
                {{ tab.label }}
                <span class="lf-tab__count">{{ tab.count }}</span>
              </button>
            </div>
          </div>

          <div class="lf-filter__row">
            <el-input
              v-model="keyword"
              class="lf-search"
              :prefix-icon="Search"
              clearable
              placeholder="搜索物品、地点或关键词"
            />
            <span class="lf-filter__hint t-xs faint">
              共 {{ filtered.length }} 条
              <template v-if="hasFilter">
                ·
                <button type="button" class="link-btn" @click="clearFilters">清空筛选</button>
              </template>
            </span>
          </div>

          <div class="chip-row lf-cats">
            <button
              v-for="cat in lostfoundCategories"
              :key="cat"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': categoryFilter === cat }"
              @click="categoryFilter = cat"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="lf-list">
          <div v-for="i in 3" :key="i" class="card post-card post-card--sk">
            <div class="sk sk--w20"></div>
            <div class="sk sk--w60"></div>
            <div class="sk sk--w90"></div>
            <div class="sk sk--w40"></div>
          </div>
        </div>

        <div v-else-if="!filtered.length" class="card lf-empty">
          <EmptyState
            title="没有找到匹配的信息"
            desc="换个关键词或类别再试试，也可以发布一条信息，让 AI 持续帮你匹配。"
          >
            <el-button @click="clearFilters">清空筛选</el-button>
            <el-button type="primary" @click="goPublish('lost')">发布一条</el-button>
          </EmptyState>
        </div>

        <div v-else class="lf-list">
          <article
            v-for="post in filtered"
            :key="post.id"
            class="card card--hover post-card"
            :class="`post-card--${post.type}`"
            @click="openDetail(post)"
          >
            <div class="post-card__head">
              <span class="post-card__no mono">{{ post.postNo }}</span>
              <StatusPill
                status="open"
                :text="post.type === 'lost' ? '寻物' : '招领'"
                :tone="post.type === 'lost' ? 'coral' : 'teal'"
                :dot="false"
              />
              <StatusPill :status="post.status" :text="statusText(post)" :tone="statusTone(post)" />
              <AiBadge v-if="post.aiGenerated" ghost small />
              <span class="post-card__time">{{ timeAgo(post.createdAt) }}</span>
            </div>

            <h3 class="post-card__title">{{ post.title }}</h3>
            <p class="post-card__desc clamp-2">{{ post.description }}</p>

            <div class="post-card__tags">
              <span class="tag-soft">{{ post.category }}</span>
              <span v-if="post.color" class="tag-soft">{{ post.color }}</span>
              <span
                v-if="post.type === 'lost'"
                class="tag-soft"
                :class="post.rewardEnabled ? 'tag-soft--amber reward-tag' : 'reward-tag reward-tag--none'"
              >
                <el-icon><Coin /></el-icon>
                {{ post.rewardEnabled ? `悬赏 ¥${Number(post.rewardAmount || 0).toFixed(2)}` : '未设置打赏' }}
              </span>
            </div>

            <div class="post-card__meta">
              <span class="meta-item">
                <el-icon><Location /></el-icon>{{ post.place }}
              </span>
              <span class="meta-item">
                <el-icon><Clock /></el-icon>{{ post.timeText }}
              </span>
              <button type="button" class="contact-chip" @click.stop="contactTip">
                <el-icon><Lock /></el-icon>{{ post.contactMasked }}
              </button>
            </div>

            <div class="post-card__foot">
              <span class="match-badge" :class="{ 'match-badge--on': matchCounts[post.id] > 0 }">
                <el-icon><Connection /></el-icon>AI 匹配 {{ matchCounts[post.id] || 0 }} 条
              </span>
              <span class="post-card__more">查看详情 <el-icon><ArrowRight /></el-icon></span>
            </div>
          </article>
        </div>
      </div>

      <!-- 右侧：AI 匹配 / 发布 / 小贴士 -->
      <aside class="lf-side">
        <SectionCard title="AI 双向匹配" desc="寻物 ↔ 招领的特征加权比对，优先展示最相似的三组">
          <template #actions>
            <AiBadge ghost small />
            <el-button
              text
              size="small"
              :icon="Refresh"
              :loading="refreshing"
              aria-label="刷新匹配"
              title="刷新匹配"
              @click="refreshMatch"
            />
          </template>

          <div v-if="topPairs.length" class="pair-list">
            <div v-for="pair in topPairs" :key="`${pair.lost.id}-${pair.found.id}`" class="pair">
              <ProgressRing :value="pair.score" :size="54" :stroke="5" tone="brand" caption="相似" />
              <div class="pair__main">
                <button type="button" class="pair__line" @click="openDetail(pair.lost)">
                  <StatusPill status="open" text="寻物" tone="coral" :dot="false" />
                  <span class="pair__title">{{ pair.lost.title.replace('【寻物】', '') }}</span>
                </button>
                <span class="pair__swap">
                  <el-icon><Connection /></el-icon>互为反向线索
                </span>
                <button type="button" class="pair__line" @click="openDetail(pair.found)">
                  <StatusPill status="open" text="招领" tone="teal" :dot="false" />
                  <span class="pair__title">{{ pair.found.title.replace('【招领】', '') }}</span>
                </button>
                <div class="pair__reasons">
                  <span v-for="reason in pair.reasons.slice(0, 3)" :key="reason" class="tag-soft tag-soft--brand">
                    {{ reason }}
                  </span>
                </div>
              </div>
              <el-button class="pair__view" text type="primary" size="small" @click="openDetail(pair.lost)">
                查看
              </el-button>
            </div>
          </div>
          <EmptyState
            v-else
            compact
            title="暂无线索"
            desc="发布寻物或招领后，AI 会自动做双向特征比对。"
          />

          <div class="pair-foot">
            <span class="t-xs faint">规则：物品类别 + 颜色 + 地点 + 时间窗口</span>
            <span class="tag-soft tag-soft--teal">实时</span>
          </div>
        </SectionCard>

        <LostFoundSupportPanel
          :pending-claim-count="pendingClaimCount"
          :reward-post-count="rewardPostCount"
          :resolved-count="resolvedCount"
          :resolved-cases="resolvedCases"
          :using-fallback-cases="usingFallbackCases"
        >
          <template #publish>
        <div class="card publish-card">
          <span class="publish-card__glow" aria-hidden="true"></span>
          <div class="row gap-2 wrap">
            <span class="tag-soft tag-soft--brand"><el-icon><MagicStick /></el-icon>AI 文案生成</span>
            <AiBadge ghost small />
          </div>
          <h3 class="publish-card__title">丢东西了？先让 AI 帮你写清楚</h3>
          <p class="publish-card__desc">
            填几个关键词，AI 生成规范标题与描述，并自动把信息放进双向匹配池。
          </p>
          <div class="publish-card__actions">
            <el-button type="primary" size="large" @click="goPublish('lost')">
              <el-icon><Search /></el-icon>发布寻物
            </el-button>
            <el-button size="large" @click="goPublish('found')">
              <el-icon><Plus /></el-icon>发布招领
            </el-button>
          </div>
        </div>
          </template>

          <template #tips>
          <SectionCard title="AI 小贴士" desc="写对信息，找回更快">
          <ul class="tip-list">
            <li class="tip">
              <span class="tip__no">01</span>
              <div>
                <b>三要素尽量写全</b>
                <p>物品 + 颜色 + 地点齐全时，双向匹配命中率约提升 42%。</p>
              </div>
            </li>
            <li class="tip">
              <span class="tip__no">02</span>
              <div>
                <b>独特特征比型号更有用</b>
                <p>贴纸、划痕、挂件这类细节，往往才是认领核验的关键。</p>
              </div>
            </li>
            <li class="tip">
              <span class="tip__no">03</span>
              <div>
                <b>联系方式默认脱敏</b>
                <p>广场只展示「姓 + **」，认领请先通过站内沟通核对特征。</p>
              </div>
            </li>
          </ul>
          <div class="tip-foot">
            <el-icon><InfoFilled /></el-icon>
            <span>以上为演示数据与模拟匹配结果，不涉及真实联系方式。</span>
          </div>
        </SectionCard>
          </template>
        </LostFoundSupportPanel>
      </aside>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :width="dialogWidth"
      align-center
      append-to-body
      destroy-on-close
      class="lf-dialog"
    >
      <template #header>
        <div v-if="detail" class="dlg-head">
          <div class="row gap-2 wrap">
            <StatusPill
              status="open"
              :text="detail.type === 'lost' ? '寻物' : '招领'"
              :tone="detail.type === 'lost' ? 'coral' : 'teal'"
              :dot="false"
            />
            <StatusPill :status="detail.status" :text="statusText(detail)" :tone="statusTone(detail)" />
            <AiBadge v-if="detail.aiGenerated" ghost small />
          </div>
          <h3 class="dlg-head__title">{{ detail.title }}</h3>
          <div class="dlg-head__meta mono">{{ detail.postNo }} · 发布于 {{ timeAgo(detail.createdAt) }}</div>
        </div>
      </template>

      <div v-if="detail" class="dlg-body">
        <div v-if="detail.aiGenerated" class="notice dlg-ai">
          <el-icon><MagicStick /></el-icon>
          <div class="grow">
            <b>AI 生成内容</b>
            <p>标题与描述由「校园智能调度平台文案生成能力」产出，发布者已确认；如信息有偏差，请以站内沟通为准。</p>
          </div>
          <AiBadge small />
        </div>

        <img v-if="detail.image" :src="detail.image" class="dlg-image" alt="物品图片" />

        <p class="dlg-desc">{{ detail.description }}</p>

        <div class="dlg-info">
          <div class="dlg-info__item"><span>物品类别</span><b>{{ detail.category }}</b></div>
          <div class="dlg-info__item"><span>颜色特征</span><b>{{ detail.color || '未填写' }}</b></div>
          <div class="dlg-info__item"><span>地点</span><b>{{ detail.place }}</b></div>
          <div class="dlg-info__item"><span>时间</span><b>{{ detail.timeText }}</b></div>
        </div>

        <div v-if="detail.tags?.length" class="dlg-tags">
          <span v-for="tag in detail.tags" :key="tag" class="tag-soft tag-soft--brand"># {{ tag }}</span>
        </div>

        <section v-if="detailIsLost" class="reward-flow">
          <div class="reward-flow__head">
            <span class="reward-flow__icon"><el-icon><Coin /></el-icon></span>
            <div class="grow">
              <div class="reward-flow__title">
                寻物打赏与归还流程
                <span v-if="detailReward.enabled" class="tag-soft tag-soft--amber">
                  悬赏 ¥{{ detailReward.amount.toFixed(2) }}
                </span>
                <span v-else class="tag-soft">未设置打赏</span>
              </div>
              <p v-if="detailReward.enabled">
                提供有效线索或归还物品后，由发布者确认并向帮助者打赏。
              </p>
              <p v-else>
                发布者未设置打赏。找回物品时，需要失主自行联系拾得者并线下领取。
              </p>
            </div>
          </div>

          <div v-if="detailReward.enabled" class="reward-flow__steps">
            <span><b>01</b>提交线索 / 归还说明</span>
            <span><b>02</b>发布者核验物品</span>
            <span><b>03</b>确认打赏并结束寻物</span>
          </div>
          <div v-else class="notice notice--amber reward-guide">
            <el-icon><InfoFilled /></el-icon>
            <span>没有打赏时，不进入结算流程。请根据线索中的联系方式自行联系拾得者，领取后点击“确认自行领取”。</span>
          </div>

          <div v-if="detailClaims.length" class="claim-list">
            <article v-for="claim in detailClaims" :key="claim.id" class="claim-item" :class="`is-${claim.status}`">
              <div class="claim-item__head">
                <div>
                  <strong>{{ claim.helperName }}</strong>
                  <span class="tag-soft" :class="claim.mode === 'returned' ? 'tag-soft--teal' : 'tag-soft--brand'">
                    {{ claim.mode === 'returned' ? '已归还物品' : '提供线索' }}
                  </span>
                </div>
                <span class="claim-status" :class="`is-${claim.status}`">{{ claimStatusText(claim.status) }}</span>
              </div>
              <p>{{ claim.description }}</p>
              <div class="claim-item__meta">
                <span><el-icon><Lock /></el-icon>联系方式：{{ claim.contact || '站内联系' }}</span>
                <span>{{ timeAgo(claim.createdAt) }}</span>
              </div>
              <div
                v-if="detailIsOwner && claim.status === 'submitted'"
                class="claim-item__actions"
              >
                <el-button
                  v-if="detailReward.enabled"
                  type="primary"
                  size="small"
                  :icon="Wallet"
                  @click="openReward(claim)"
                >
                  确认打赏 ¥{{ detailReward.amount.toFixed(2) }}
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  size="small"
                  :icon="CircleCheck"
                  @click="confirmPickup(claim)"
                >
                  我已自行联系并领取
                </el-button>
              </div>
              <div v-if="detailIsOwner && claim.status === 'submitted'" class="claim-item__actions">
                <el-button text size="small" @click="cancelClaim(claim)">关闭线索</el-button>
              </div>
            </article>
          </div>
          <div v-else class="claim-empty">
            <span><el-icon><Connection /></el-icon></span>
            <p>还没有同学提交线索或归还说明。</p>
          </div>

          <div v-if="!detailIsOwner && detail.status !== 'resolved'" class="claim-entry">
            <template v-if="myDetailClaim">
              <div class="notice notice--teal">
                <el-icon><CircleCheck /></el-icon>
                <span>你已提交{{ myDetailClaim.mode === 'returned' ? '归还说明' : '线索' }}，正在等待发布者确认。</span>
                <el-button text size="small" @click="cancelClaim(myDetailClaim)">撤回</el-button>
              </div>
            </template>
            <template v-else>
              <div class="claim-entry__copy">
                <b>你找到线索了吗？</b>
                <span>提交后发布者会在本页看到你的联系说明。</span>
              </div>
              <el-button plain @click="openClaim('clue')">我提供线索</el-button>
              <el-button type="primary" @click="openClaim('returned')">我已归还物品</el-button>
            </template>
          </div>
        </section>

        <section v-if="detailIsFound" class="found-claim-flow">
          <div class="found-claim-flow__head">
            <span class="found-claim-flow__icon"><el-icon><CircleCheck /></el-icon></span>
            <div class="grow">
              <div class="found-claim-flow__title">
                失物认领
                <span class="tag-soft tag-soft--teal">发布者核验归属</span>
              </div>
              <p>先发布寻物信息，再从招领帖发起认领申请。招领发布者通过后，由失主确认领取。</p>
            </div>
          </div>

          <template v-if="detailIsOwner">
            <div v-if="foundClaims.length" class="claim-list">
              <article
                v-for="claim in foundClaims"
                :key="claim.id"
                class="claim-item found-claim-item"
                :class="`is-${claim.status}`"
              >
                <div class="claim-item__head">
                  <div>
                    <strong>{{ claim.claimantName }}</strong>
                    <span class="tag-soft tag-soft--brand">失物认领</span>
                    <span v-if="claim.rewardEnabled" class="tag-soft tag-soft--amber">
                      寻物悬赏 ¥{{ Number(claim.rewardAmount || 0).toFixed(2) }}
                    </span>
                  </div>
                  <span class="claim-status" :class="`is-${claim.status}`">{{ claimStatusText(claim.status) }}</span>
                </div>
                <p>{{ claim.description }}</p>
                <div class="claim-item__meta">
                  <span>关联寻物：{{ claim.lostPostTitle }}</span>
                  <span>{{ claim.contact }}</span>
                </div>
                <div v-if="claim.status === 'submitted'" class="claim-item__actions">
                  <el-button text size="small" @click="reviewFoundClaim(claim, false)">驳回</el-button>
                  <el-button type="primary" size="small" @click="reviewFoundClaim(claim, true)">通过认领</el-button>
                </div>
                <div v-else-if="claim.status === 'approved'" class="claim-awaiting">
                  已通过核验，等待失主确认领取{{ claim.rewardEnabled ? '并记录打赏' : '' }}。
                </div>
              </article>
            </div>
            <div v-else class="claim-empty">
              <span><el-icon><Connection /></el-icon></span>
              <p>还没有失主提交认领申请。可以先完善物品特征，方便对方核验。</p>
            </div>
          </template>

          <template v-else>
            <div v-if="myFoundClaim" class="my-found-claim" :class="`is-${myFoundClaim.status}`">
              <div class="claim-item__head">
                <div>
                  <strong>你的认领申请</strong>
                  <span class="tag-soft">{{ myFoundClaim.lostPostTitle }}</span>
                </div>
                <span class="claim-status" :class="`is-${myFoundClaim.status}`">
                  {{ claimStatusText(myFoundClaim.status) }}
                </span>
              </div>
              <p>
                {{
                  myFoundClaim.status === 'submitted'
                    ? '招领发布者正在核验你的物品归属说明。'
                    : '归属核验已通过，请确认领取。'
                }}
              </p>
              <div v-if="myFoundClaim.status === 'approved'" class="claim-item__actions">
                <el-button
                  type="primary"
                  :icon="myFoundClaim.rewardEnabled ? Wallet : CircleCheck"
                  @click="completeFoundClaim(myFoundClaim)"
                >
                  {{
                    myFoundClaim.rewardEnabled
                      ? `确认领取并打赏 ¥${Number(myFoundClaim.rewardAmount || 0).toFixed(2)}`
                      : '确认已现场领取'
                  }}
                </el-button>
              </div>
              <div v-else class="claim-item__actions">
                <el-button text size="small" @click="cancelClaim(myFoundClaim)">撤回认领</el-button>
              </div>
            </div>

            <div v-else-if="detail.status !== 'resolved'" class="found-claim-entry">
              <div class="found-claim-entry__copy">
                <b>这是你丢失的物品吗？</b>
                <span v-if="claimableLostPosts.length">选择你发布的寻物信息，提交归属说明后等待招领发布者核验。</span>
                <span v-else>需要先发布一条寻物信息，才能认领招领物品。</span>
              </div>
              <el-button
                v-if="claimableLostPosts.length"
                type="primary"
                :icon="CircleCheck"
                @click="openFoundClaim"
              >
                认领这件物品
              </el-button>
              <el-button v-else type="primary" @click="goPublish('lost')">先发布寻物信息</el-button>
            </div>
          </template>

          <div class="found-claim-steps">
            <span><b>01</b>发布寻物</span>
            <i></i>
            <span><b>02</b>提交认领</span>
            <i></i>
            <span><b>03</b>招领人核验</span>
            <i></i>
            <span><b>04</b>确认领取</span>
          </div>
        </section>

        <div class="dlg-contact">
          <div class="row gap-2">
            <el-icon><Lock /></el-icon>
            <b>联系方式默认脱敏</b>
          </div>
          <button type="button" class="contact-chip contact-chip--lg" @click="contactTip">
            {{ detail.contactMasked }} · 点击查看说明
          </button>
          <p class="t-xs dim">仅站内可见，不展示真实手机号；认领前请先核验物品特征。</p>
        </div>

        <div class="dlg-match">
          <div class="dlg-match__head">
            <div class="row gap-2">
              <b>AI 匹配线索</b>
              <span class="tag-soft tag-soft--teal">{{ detailMatches.length }} 条</span>
            </div>
            <AiBadge ghost small />
          </div>

          <div v-if="detailMatches.length" class="dlg-match__list">
            <div v-for="m in detailMatches" :key="m.post.id" class="match">
              <div class="match__score">
                <b>{{ m.score }}</b><span>%</span>
              </div>
              <div class="match__main">
                <button type="button" class="match__title" @click="switchDetail(m.post)">
                  {{ m.post.title }}
                </button>
                <div class="match__reasons">
                  <span v-for="r in m.reasons.slice(0, 3)" :key="r" class="tag-soft tag-soft--brand">
                    {{ r }}
                  </span>
                </div>
              </div>
              <el-button text type="primary" size="small" @click="switchDetail(m.post)">查看</el-button>
            </div>
          </div>
          <div v-else class="dlg-match__empty">
            暂未发现相似度 ≥ 40% 的反向线索，AI 会持续比对，也可以主动刷新匹配。
          </div>
        </div>
      </div>

      <template #footer>
        <div v-if="detail" class="dlg-foot">
          <el-button v-if="detailCanManage" text type="danger" :icon="Delete" @click="removePost">删除</el-button>
          <span class="grow"></span>
          <el-button
            v-if="detailCanManage && detail.status === 'resolved'"
            :icon="Refresh"
            :loading="rematching"
            @click="markReopen"
          >
            重新匹配
          </el-button>
          <el-button v-else-if="detailCanManage" type="primary" :icon="CircleCheck" @click="markResolved">标记已完成</el-button>
          <span v-else class="t-xs muted">仅发布者或管理员可变更状态</span>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="claimDialogVisible"
      width="min(520px, 92vw)"
      align-center
      append-to-body
      :title="claimMode === 'returned' ? '提交归还说明' : '提供寻物线索'"
    >
      <div class="claim-dialog">
        <div class="notice notice--teal">
          <el-icon><Coin v-if="detailReward.enabled" /><InfoFilled v-else /></el-icon>
          <span v-if="detailReward.enabled">
            发布者设置了 ¥{{ detailReward.amount.toFixed(2) }} 悬赏，发布者确认后会向你结算。
          </span>
          <span v-else>
            本条寻物未设置打赏。发布者会自行联系你领取物品，请留下可靠的站内联系说明。
          </span>
        </div>
        <el-form label-position="top">
          <el-form-item :label="claimMode === 'returned' ? '归还说明' : '线索说明'" required>
            <el-input
              v-model="claimForm.description"
              type="textarea"
              :rows="4"
              maxlength="180"
              show-word-limit
              :placeholder="
                claimMode === 'returned'
                  ? '说明你在哪里捡到、物品特征以及当前保管方式'
                  : '说明你看到的线索、可能地点或物品特征'
              "
            />
          </el-form-item>
          <el-form-item label="联系说明">
            <el-input
              v-model="claimForm.contact"
              maxlength="40"
              placeholder="如：站内联系 / 图书馆一楼服务台"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="claimSubmitting" @click="claimDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="claimSubmitting" @click="submitClaim">
          提交{{ claimMode === 'returned' ? '归还说明' : '线索' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rewardDialogVisible"
      width="min(460px, 92vw)"
      align-center
      append-to-body
      title="确认寻物打赏"
    >
      <div v-if="rewardTarget" class="reward-dialog">
        <div class="reward-dialog__person">
          <UserAvatar
            class="reward-dialog__avatar"
            :name="rewardTarget.helperName"
            :user-id="rewardTarget.helperId"
            :size="38"
          />
          <div>
            <strong>{{ rewardTarget.helperName }}</strong>
            <span>{{ rewardTarget.mode === 'returned' ? '已归还物品' : '提供了有效线索' }}</span>
          </div>
        </div>
        <p>{{ rewardTarget.description }}</p>
        <div class="reward-dialog__amount">
          <span>打赏金额</span>
          <el-input-number
            v-model="rewardAmount"
            :min="0.01"
            :max="500"
            :precision="2"
            :step="1"
            controls-position="right"
          />
        </div>
        <div class="notice notice--amber">
          <el-icon><InfoFilled /></el-icon>
          <span>确认后本次寻物将标记完成，演示环境只记录结算状态，不发起真实支付。</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="rewardDialogVisible = false">再检查一下</el-button>
        <el-button type="primary" :icon="Wallet" @click="submitReward">
          确认打赏 ¥{{ Number(rewardAmount || 0).toFixed(2) }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="foundClaimDialogVisible"
      width="min(540px, 92vw)"
      align-center
      append-to-body
      title="认领招领物品"
    >
      <div class="found-claim-dialog">
        <div class="notice notice--teal">
          <el-icon><CircleCheck /></el-icon>
          <span>认领申请会关联你的寻物信息，由招领发布者核验物品归属。</span>
        </div>
        <el-form label-position="top">
          <el-form-item label="关联寻物信息" required>
            <el-select v-model="foundClaimForm.lostPostId" placeholder="选择你发布的寻物信息" style="width: 100%">
              <el-option
                v-for="post in claimableLostPosts"
                :key="post.id"
                :label="post.title"
                :value="post.id"
              >
                <span>{{ post.title }}</span>
                <span class="found-claim-option-reward">
                  {{ post.rewardEnabled ? `悬赏 ¥${Number(post.rewardAmount || 0).toFixed(2)}` : '无打赏' }}
                </span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="归属核验说明" required>
            <el-input
              v-model="foundClaimForm.description"
              type="textarea"
              :rows="4"
              maxlength="180"
              show-word-limit
              placeholder="描述只有失主知道的特征，如贴纸、划痕、挂件、内容物等"
            />
          </el-form-item>
          <el-form-item label="联系说明">
            <el-input
              v-model="foundClaimForm.contact"
              maxlength="40"
              placeholder="如：站内联系 / 领取地点"
            />
          </el-form-item>
        </el-form>
        <div
          v-if="claimableLostPosts.find((post) => post.id === foundClaimForm.lostPostId)?.rewardEnabled"
          class="found-claim-dialog__reward"
        >
          <Coin />
          认领通过后需要确认并记录打赏 ¥{{
            Number(
              claimableLostPosts.find((post) => post.id === foundClaimForm.lostPostId)?.rewardAmount || 0,
            ).toFixed(2)
          }}
        </div>
      </div>
      <template #footer>
        <el-button :disabled="foundClaimSubmitting" @click="foundClaimDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="foundClaimSubmitting" @click="submitFoundClaim">
          提交认领申请
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ---------- 顶部 ---------- */
.head-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.lf-stats {
  gap: 14px;
}

/* ---------- 左侧信息流 ---------- */
.lf-feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.lf-filter {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
}

.lf-tabs-wrap {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.lf-tabs-wrap::-webkit-scrollbar {
  display: none;
}

.lf-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
}

.lf-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  transition: background var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}

.lf-tab:hover {
  color: var(--brand-600);
}

.lf-tab.is-active {
  background: var(--surface);
  color: var(--brand-700);
  box-shadow: var(--shadow-xs);
}

.lf-tab__count {
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lf-tab.is-active .lf-tab__count {
  background: var(--brand-50);
  color: var(--brand-600);
}

.lf-filter__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.lf-search {
  width: 288px;
  max-width: 100%;
}

.lf-filter__hint {
  margin-left: auto;
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--brand-600);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.lf-cats {
  gap: 8px;
}

.lf-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.lf-empty {
  overflow: hidden;
}

/* ---------- 信息卡片 ---------- */
.post-card {
  position: relative;
  overflow: hidden;
  padding: 17px 18px 15px 22px;
  cursor: pointer;
}

.post-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--grad-warm);
}

.post-card--found::before {
  background: var(--grad-teal);
}

.post-card__head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.post-card__no {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.post-card__time {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--text-4);
  white-space: nowrap;
}

.post-card__title {
  margin: 10px 0 0;
  font-size: 15.5px;
  font-weight: 680;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--text-1);
  transition: color var(--dur) var(--ease-out);
}

.post-card:hover .post-card__title {
  color: var(--brand-600);
}

.post-card__desc {
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.65;
  color: var(--text-2);
}

.post-card__tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.post-card__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-2);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.meta-item .el-icon {
  color: var(--text-4);
  font-size: 13px;
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  margin-left: auto;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  user-select: none;
  transition: background var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}

.contact-chip:hover {
  background: var(--brand-50);
  color: var(--brand-600);
}

.contact-chip--lg {
  height: 34px;
  margin-left: 0;
  padding: 0 14px;
  font-size: var(--fs-sm);
}

.post-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
}

.match-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
}

.match-badge--on {
  background: var(--brand-50);
  color: var(--brand-700);
}

.post-card__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-600);
}

/* 骨架 */
.post-card--sk {
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 20px 20px 20px 24px;
}

.post-card--sk::before {
  background: var(--line-strong);
}

.sk {
  height: 12px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, #eef0f7 25%, #f7f8fc 37%, #eef0f7 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.sk--w20 {
  width: 20%;
}

.sk--w40 {
  width: 40%;
}

.sk--w60 {
  width: 60%;
  height: 18px;
}

.sk--w90 {
  width: 90%;
}

/* ---------- 右侧 ---------- */
.lf-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.pair-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pair {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 12px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--brand-50), var(--surface) 72%);
  border: 1px solid var(--brand-100);
}

.pair__main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 0;
}

.pair__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
}

.pair__title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
}

.pair__line:hover .pair__title {
  color: var(--brand-600);
}

.pair__swap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 2px;
  color: var(--text-3);
  font-size: 10px;
}

.pair__reasons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.pair__reasons .tag-soft {
  height: 20px;
  padding: 0 7px;
  font-size: 10px;
}

.pair__view {
  flex: none;
  align-self: center;
}

.pair-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}

/* 发布入口 */
.publish-card {
  position: relative;
  overflow: hidden;
  padding: 20px;
  background: linear-gradient(145deg, #f4f2ff 0%, #eef9f7 100%);
  border-color: var(--brand-100);
}

.publish-card__glow {
  position: absolute;
  top: -60px;
  right: -50px;
  width: 170px;
  height: 170px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(108, 99, 255, 0.22), transparent 70%);
  pointer-events: none;
}

.publish-card__title {
  position: relative;
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.publish-card__desc {
  position: relative;
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.65;
  color: var(--text-2);
}

.publish-card__actions {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.publish-card__actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.publish-card__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* 小贴士 */
.tip-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tip__no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.tip b {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--text-1);
}

.tip p {
  margin: 2px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-3);
}

.tip-foot {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  color: var(--text-4);
  font-size: 11px;
  line-height: 1.6;
}

.tip-foot .el-icon {
  margin-top: 1px;
  flex: none;
}

/* ---------- 详情弹窗 ---------- */
.dlg-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 26px;
}

.dlg-head__title {
  margin: 8px 0 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.02em;
  color: var(--text-1);
}

.dlg-head__meta {
  font-size: 11px;
  color: var(--text-4);
  letter-spacing: 0.02em;
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 64vh;
  overflow-y: auto;
  padding-right: 4px;
}

.dlg-ai {
  align-items: flex-start;
}

.dlg-ai b {
  font-size: var(--fs-sm);
}

.dlg-ai p {
  margin: 2px 0 0;
  line-height: 1.6;
  font-size: var(--fs-xs);
  opacity: 0.9;
}

.dlg-image {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--line);
}

.dlg-desc {
  font-size: var(--fs-base);
  line-height: 1.75;
  color: var(--text-2);
  white-space: pre-line;
}

.dlg-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dlg-info__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
  min-width: 0;
}

.dlg-info__item span {
  font-size: 11px;
  color: var(--text-3);
}

.dlg-info__item b {
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dlg-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dlg-contact {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 13px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px dashed var(--line-strong);
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.dlg-contact b {
  color: var(--text-1);
}

.dlg-match {
  padding-top: 4px;
}

.dlg-match__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.dlg-match__head b {
  font-size: var(--fs-base);
  font-weight: 680;
  color: var(--text-1);
}

.dlg-match__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.match__score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: var(--surface);
  border: 1px solid var(--brand-100);
  line-height: 1;
}

.match__score b {
  font-size: 14px;
  font-weight: 740;
  color: var(--brand-600);
  letter-spacing: -0.02em;
}

.match__score span {
  font-size: 9px;
  color: var(--brand-400);
}

.match__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.match__title {
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.match__title:hover {
  color: var(--brand-600);
}

.match__reasons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.match__reasons .tag-soft {
  height: 20px;
  padding: 0 7px;
  font-size: 10px;
}

.dlg-match__empty {
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px dashed var(--line);
  color: var(--text-3);
  font-size: var(--fs-xs);
  line-height: 1.6;
  text-align: center;
}

.dlg-foot {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---------- 打赏与领取 ---------- */
.reward-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.reward-tag--none {
  color: var(--text-3);
  background: var(--surface-2);
}

.reward-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  padding: 15px;
  border: 1px solid rgba(245, 166, 35, 0.22);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgba(245, 166, 35, 0.09), rgba(255, 255, 255, 0.94) 55%);
}

.reward-flow__head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.reward-flow__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: var(--amber-600);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  font-size: 18px;
}

.reward-flow__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
}

.reward-flow__head p {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.reward-flow__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.reward-flow__steps span {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.74);
  font-size: 10.5px;
  color: var(--text-2);
}

.reward-flow__steps b {
  color: var(--amber-600);
  font-size: 9px;
  letter-spacing: 0.05em;
}

.reward-guide {
  margin: 0;
  align-items: flex-start;
}

.claim-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.claim-item {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
}

.claim-item.is-rewarded,
.claim-item.is-picked_up {
  border-color: rgba(18, 179, 166, 0.2);
  background: rgba(18, 179, 166, 0.04);
}

.claim-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.claim-item__head > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.claim-item__head strong {
  font-size: 12px;
  color: var(--text-1);
}

.claim-status {
  font-size: 10px;
  font-weight: 650;
  color: var(--text-3);
}

.claim-status.is-rewarded,
.claim-status.is-picked_up {
  color: var(--teal-600);
}

.claim-status.is-cancelled {
  color: var(--text-4);
  text-decoration: line-through;
}

.claim-item > p {
  margin: 8px 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.claim-item__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-3);
}

.claim-item__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.claim-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--line);
}

.claim-empty {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  border: 1px dashed var(--line-strong);
  border-radius: 11px;
  color: var(--text-3);
}

.claim-empty span {
  font-size: 16px;
}

.claim-empty p {
  margin: 0;
  font-size: 11px;
}

.claim-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid rgba(245, 166, 35, 0.15);
}

.claim-entry__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 170px;
}

.claim-entry__copy b {
  font-size: 11.5px;
  color: var(--text-1);
}

.claim-entry__copy span {
  font-size: 10px;
  color: var(--text-3);
}

.claim-entry .notice {
  width: 100%;
  margin: 0;
}

.claim-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.claim-dialog .notice {
  margin: 0;
  align-items: flex-start;
}

.reward-dialog {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.reward-dialog__person {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reward-dialog__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, var(--amber-500), var(--coral-500));
  font-weight: 700;
}

.reward-dialog__person > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reward-dialog__person strong {
  font-size: 13px;
  color: var(--text-1);
}

.reward-dialog__person span {
  font-size: 10.5px;
  color: var(--text-3);
}

.reward-dialog > p {
  margin: 0;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-2);
}

.reward-dialog__amount {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.reward-dialog .notice {
  margin: 0;
  align-items: flex-start;
}

.found-claim-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  padding: 15px;
  border: 1px solid rgba(18, 179, 166, 0.2);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgba(18, 179, 166, 0.08), rgba(255, 255, 255, 0.94) 58%);
}

.found-claim-flow__head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.found-claim-flow__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: var(--teal-600);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  font-size: 18px;
}

.found-claim-flow__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-1);
}

.found-claim-flow__head p {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}

.found-claim-item.is-approved {
  border-color: rgba(18, 179, 166, 0.2);
  background: rgba(18, 179, 166, 0.05);
}

.found-claim-item.is-rejected {
  opacity: 0.7;
}

.claim-awaiting {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed var(--line);
  font-size: 10.5px;
  color: var(--teal-600);
}

.my-found-claim {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
}

.my-found-claim.is-approved {
  border-color: rgba(18, 179, 166, 0.24);
  background: rgba(18, 179, 166, 0.05);
}

.my-found-claim > p {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}

.found-claim-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid rgba(18, 179, 166, 0.15);
}

.found-claim-entry__copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 190px;
}

.found-claim-entry__copy b {
  font-size: 11.5px;
  color: var(--text-1);
}

.found-claim-entry__copy span {
  font-size: 10px;
  line-height: 1.55;
  color: var(--text-3);
}

.found-claim-steps {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto 1fr auto;
  align-items: center;
  gap: 6px;
  padding-top: 11px;
  border-top: 1px dashed rgba(18, 179, 166, 0.16);
}

.found-claim-steps span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
  font-size: 9px;
  white-space: nowrap;
}

.found-claim-steps b {
  color: var(--teal-600);
}

.found-claim-steps i {
  height: 1px;
  background: var(--line);
}

.found-claim-dialog {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.found-claim-dialog .notice {
  margin: 0;
  align-items: flex-start;
}

.found-claim-option-reward {
  float: right;
  margin-left: 16px;
  color: var(--amber-600);
  font-size: 10px;
}

.found-claim-dialog__reward {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--amber-700);
  background: var(--amber-50);
  font-size: 11px;
}

.found-claim-dialog__reward svg {
  width: 15px;
  height: 15px;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .lf-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .publish-card {
    grid-column: span 2;
  }
}

@media (max-width: 900px) {
  .lf-side {
    display: flex;
  }

  .publish-card {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .lf-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .lf-stats :deep(.stat) {
    padding: 11px 10px;
  }

  .lf-stats :deep(.stat__hint),
  .lf-stats :deep(.stat__icon) {
    display: none;
  }

  .lf-stats :deep(.stat__value) {
    font-size: 20px;
  }

  .lf-search {
    width: 100%;
  }

  .lf-filter__hint {
    margin-left: 0;
  }

  .post-card {
    padding: 15px 14px 13px 18px;
  }

  .post-card__title {
    font-size: 15px;
  }

  .post-card__time {
    width: 100%;
    margin-left: 0;
    order: 5;
  }

  .contact-chip {
    margin-left: 0;
  }

  .pair {
    padding: 10px;
    gap: 9px;
  }

  .pair__view {
    display: none;
  }

  .publish-card__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .post-card__foot {
    justify-content: flex-start;
  }

  .dlg-info {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dlg-body {
    max-height: 62vh;
  }

  .dlg-head__title {
    font-size: var(--fs-lg);
  }

  .dlg-foot {
    flex-wrap: wrap;
  }

  .reward-flow {
    padding: 12px;
  }

  .reward-flow__steps {
    grid-template-columns: minmax(0, 1fr);
  }

  .claim-entry {
    align-items: stretch;
  }

  .claim-entry :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }

  .reward-dialog__amount {
    align-items: stretch;
    flex-direction: column;
  }

  .reward-dialog__amount :deep(.el-input-number) {
    width: 100%;
  }

  .found-claim-flow {
    padding: 12px;
  }

  .found-claim-entry {
    align-items: stretch;
  }

  .found-claim-entry :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }

  .found-claim-steps {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .found-claim-steps i {
    display: none;
  }

  .found-claim-steps span {
    flex-direction: column;
    gap: 2px;
    white-space: normal;
  }
}

@media (max-width: 420px) {
  .publish-card__actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
