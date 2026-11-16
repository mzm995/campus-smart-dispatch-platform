<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  CopyDocument,
  Cpu,
  DataAnalysis,
  Document,
  Lock,
  MagicStick,
  Operation,
  StarFilled,
  Timer,
  User,
  WarningFilled,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import AiBadge from '@/components/AiBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAiRecordStore } from '@/stores/aiRecord'
import { useUserStore } from '@/stores/user'
import { WEEK_CN, fmtDate, fmtDateTime } from '@/utils/format'

const router = useRouter()
const aiRecord = useAiRecordStore()
const user = useUserStore()

const loading = ref(true)
const pageError = ref('')
const copiedId = ref('')
const copyingSummary = ref(false)

let loadTimer = null
let copiedTimer = null

const tools = computed(() => aiRecord.tools || [])
const prompts = computed(() => aiRecord.prompts || [])
const rounds = computed(() => aiRecord.rounds || [])
const compliance = computed(() => aiRecord.compliance || [])
const currentRound = computed(() => aiRecord.currentRound || null)
const stats = computed(
  () =>
    aiRecord.stats || {
      totalCalls: 0,
      successRate: 0,
      avgLatency: '—',
      tokens: '—',
      cost: '—',
      daily: [],
    },
)
const delta = computed(() => aiRecord.delta || { accuracy: 0, latency: '0.0', satisfaction: 0 })
const usageRecords = computed(() => aiRecord.usageRecords || [])
const usageScope = computed(() => aiRecord.usageScope)
const canSwitchUsageScope = computed(() => user.canViewOtherUsers)

const openPrompt = computed({
  get: () => aiRecord.activePrompt,
  set: (id) => aiRecord.setPrompt(id || ''),
})

function roundNum(value) {
  const num = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(num) ? num : 0
}

function pctOf(value) {
  return Math.round(roundNum(value) * 100)
}

const kpiAccuracy = computed(() =>
  currentRound.value ? pctOf(currentRound.value.after.accuracy) : Math.round(roundNum(stats.value.successRate) * 100),
)
const kpiSatisfaction = computed(() => (currentRound.value ? pctOf(currentRound.value.after.satisfaction) : '—'))
const kpiLatency = computed(() => {
  const raw = currentRound.value?.after?.avgLatency ?? stats.value.avgLatency
  return String(raw ?? '').replace(/\s*s$/i, '') || '—'
})

const accuracyHint = computed(() =>
  currentRound.value
    ? `第 ${currentRound.value.round} 轮模拟 · 优化前 ${pctOf(currentRound.value.before.accuracy)}%`
    : '演示任务集模拟',
)
const latencyHint = computed(() =>
  currentRound.value
    ? `第 ${currentRound.value.round} 轮：${currentRound.value.before.avgLatency} → ${currentRound.value.after.avgLatency}`
    : '演示环境平均响应',
)
const satisfactionHint = computed(() =>
  currentRound.value
    ? `第 ${currentRound.value.round} 轮：${pctOf(currentRound.value.before.satisfaction)}% → ${pctOf(currentRound.value.after.satisfaction)}%`
    : '试用问卷折算',
)

const successRatePct = computed(() => Math.round(roundNum(stats.value.successRate) * 100))
const todayLabel = fmtDate(new Date())

const maxDaily = computed(() => Math.max(1, ...(stats.value.daily || [])))
const dayLabels = computed(() => {
  const daily = stats.value.daily || []
  return daily.map((_, index) => {
    const date = dayjs().subtract(daily.length - 1 - index, 'day')
    return index === daily.length - 1 ? '今天' : WEEK_CN[date.day()]
  })
})

function barHeight(value) {
  return Math.max(8, Math.round(((Number(value) || 0) / maxDaily.value) * 100))
}

const trendValue = computed(() => {
  const daily = stats.value.daily || []
  if (daily.length < 6) return null
  const recent = daily.slice(-3).reduce((sum, n) => sum + Number(n || 0), 0)
  const previous = daily.slice(-6, -3).reduce((sum, n) => sum + Number(n || 0), 0)
  if (!previous) return null
  return Math.round(((recent - previous) / previous) * 100)
})
const trendText = computed(() =>
  trendValue.value === null ? '' : `近 3 日 ${trendValue.value >= 0 ? '+' : ''}${trendValue.value}%`,
)

const metrics = computed(() => {
  const round = currentRound.value
  if (!round) return []
  const rows = [
    {
      key: 'accuracy',
      label: '意图识别准确率',
      short: '准确率',
      beforeNum: pctOf(round.before.accuracy),
      afterNum: pctOf(round.after.accuracy),
      beforeText: `${pctOf(round.before.accuracy)}%`,
      afterText: `${pctOf(round.after.accuracy)}%`,
      deltaText: `+${Math.max(0, pctOf(round.after.accuracy) - pctOf(round.before.accuracy))}pt`,
      hint: '演示任务集 · 准确率越高越好',
    },
    {
      key: 'latency',
      label: '平均响应时长',
      short: '响应时长',
      beforeNum: roundNum(round.before.avgLatency),
      afterNum: roundNum(round.after.avgLatency),
      beforeText: `${roundNum(round.before.avgLatency).toFixed(1)}s`,
      afterText: `${roundNum(round.after.avgLatency).toFixed(1)}s`,
      deltaText: `-${Math.max(0, roundNum(round.before.avgLatency) - roundNum(round.after.avgLatency)).toFixed(1)}s`,
      hint: '越低越好 · 两轮累计缩短 1.5s',
    },
    {
      key: 'satisfaction',
      label: '用户满意度',
      short: '满意度',
      beforeNum: pctOf(round.before.satisfaction),
      afterNum: pctOf(round.after.satisfaction),
      beforeText: `${pctOf(round.before.satisfaction)}%`,
      afterText: `${pctOf(round.after.satisfaction)}%`,
      deltaText: `+${Math.max(0, pctOf(round.after.satisfaction) - pctOf(round.before.satisfaction))}pt`,
      hint: '5 分制问卷折算 · 越高越好',
    },
  ]
  const max = Math.max(1, ...rows.flatMap((row) => [row.beforeNum, row.afterNum]))
  return rows.map((row) => ({
    ...row,
    beforeBar: Math.max(6, Math.round((row.beforeNum / max) * 100)),
    afterBar: Math.max(6, Math.round((row.afterNum / max) * 100)),
  }))
})

function isModelName(name = '') {
  return /DeepSeek|GLM|Qwen|模型/i.test(name)
}

function toolMeta(status = '') {
  if (status.includes('已接入')) return { label: '已接入', cls: 'tag-soft--brand' }
  if (status.includes('运行中')) return { label: '运行中', cls: 'tag-soft--teal' }
  if (status.includes('已使用')) return { label: '已使用', cls: '' }
  return { label: status || '未知', cls: '' }
}

function toolNote(status = '') {
  const matched = status.match(/[（(]([^）)]+)[）)]/)
  return matched ? matched[1] : ''
}

const toolRows = computed(() =>
  tools.value.map((tool) => {
    const meta = toolMeta(tool.status)
    return {
      ...tool,
      tagLabel: meta.label,
      tagClass: meta.cls,
      note: toolNote(tool.status),
      icon: isModelName(tool.name) ? Cpu : Document,
    }
  }),
)
const modelCount = computed(() => tools.value.filter((tool) => isModelName(tool.name)).length)
const depCount = computed(() => tools.value.filter((tool) => /Vue|Element/i.test(tool.name)).length)
const localCalls = computed(() => tools.value.find((tool) => tool.name.includes('本地规则引擎'))?.calls || 0)

function complianceMeta(text = '') {
  if (/AI 生成|标识/.test(text)) {
    return { title: 'AI 生成标识', tag: 'AI 标识', tagClass: 'tag-soft--brand', tone: 'is-brand', icon: MagicStick, isAi: true }
  }
  if (/人工确认|人工核对|人工/.test(text)) {
    return { title: '人工确认', tag: '人工确认', tagClass: 'tag-soft--amber', tone: 'is-amber', icon: User, isAi: false }
  }
  if (/模拟|演示|本地规则/.test(text)) {
    return { title: '演示说明', tag: '演示说明', tagClass: '', tone: 'is-neutral', icon: Document, isAi: false }
  }
  if (/脱敏|打码|隐私|敏感|联系方式|采集/.test(text)) {
    return { title: '数据脱敏', tag: '数据脱敏', tagClass: 'tag-soft--teal', tone: 'is-teal', icon: Lock, isAi: false }
  }
  return { title: '合规原则', tag: '原则', tagClass: '', tone: 'is-neutral', icon: CircleCheck, isAi: false }
}

const complianceItems = computed(() => {
  const raw = compliance.value
  const items = raw.map((text) => ({ text, ...complianceMeta(text) }))
  if (!raw.some((text) => /人工确认|人工核对/.test(text))) {
    items.push({
      text: '置信度低于 72% 的解析结果会标记为「待人工确认」，核对通过后才写入申请或匹配结果，避免 AI 直接替用户做决定。',
      title: '人工确认',
      tag: '人工确认',
      tagClass: 'tag-soft--amber',
      tone: 'is-amber',
      icon: User,
      isAi: false,
    })
  }
  return items
})

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到 textarea + execCommand 兜底
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

async function copyPrompt(prompt) {
  const ok = await copyText(prompt.content)
  if (!ok) {
    ElMessage.warning('复制失败，请手动选择 Prompt 文本')
    return
  }
  copiedId.value = prompt.id
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedId.value = ''
  }, 1800)
  ElMessage.success(`已复制「${prompt.title}」`)
}

async function copySummary() {
  if (copyingSummary.value) return
  copyingSummary.value = true
  const round = currentRound.value
  const summary = [
    '校园智能调度平台 · AI 使用记录（演示）',
    `工具与版本：${tools.value.map((tool) => `${tool.name} ${tool.version}`).join('；')}`,
    `关键 Prompt：${prompts.value.length} 组；迭代记录：${rounds.value.length} 轮`,
    round
      ? `第 ${round.round} 轮：准确率 ${pctOf(round.before.accuracy)}% → ${pctOf(round.after.accuracy)}%，响应 ${round.before.avgLatency} → ${round.after.avgLatency}，满意度 ${pctOf(round.before.satisfaction)}% → ${pctOf(round.after.satisfaction)}%`
      : '',
    `调用统计：累计 ${stats.value.totalCalls} 次，成功率 ${successRatePct.value}%，平均响应 ${stats.value.avgLatency}，Token ${stats.value.tokens}，成本 ${stats.value.cost}`,
    '合规：AI 生成内容均带标识；学号与联系方式脱敏；低置信度人工确认；演示数据不含真实隐私。',
  ]
    .filter(Boolean)
    .join('\n')
  const ok = await copyText(summary)
  copyingSummary.value = false
  if (ok) ElMessage.success('AI 使用摘要已复制')
  else ElMessage.warning('复制失败，请稍后重试')
}

function scrollTo(id) {
  const target = document.getElementById(id)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function load() {
  loading.value = true
  pageError.value = ''
  window.clearTimeout(loadTimer)
  await aiRecord.loadUsage()
  loadTimer = window.setTimeout(() => {
    if (
      !aiRecord.data ||
      !aiRecord.stats ||
      !Array.isArray(aiRecord.tools) ||
      !Array.isArray(aiRecord.prompts) ||
      !Array.isArray(aiRecord.rounds)
    ) {
      pageError.value = '本地演示数据缺失或格式异常，请前往「个人资料 → 重置演示数据」后重试。'
    } else if (aiRecord.usageError) {
      pageError.value = aiRecord.usageError
    }
    loading.value = false
  }, 280)
}

async function changeUsageScope(value) {
  await aiRecord.loadUsage(value)
  if (aiRecord.usageError) {
    ElMessage.error(aiRecord.usageError)
  }
}

function taskLabel(task = '') {
  if (task === 'parse') return '需求解析'
  if (task === 'generate') return '内容生成'
  if (task === 'forum_draft') return '论坛草稿'
  if (task === 'lostfound_copy') return '失物文案'
  if (task === 'forum_summary') return '论坛摘要'
  return task || 'AI 调用'
}

onMounted(load)
onBeforeUnmount(() => {
  window.clearTimeout(loadTimer)
  window.clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="page ai">
    <PageHeader
      eyebrow="方案 FR-08"
      title="AI 使用记录"
      desc="把工具版本、关键 Prompt、两轮模拟迭代与合规边界摊开给你看，让 AI 能力可解释、可追溯、可复盘。"
    >
      <template #meta>
        <span class="tag-soft tag-soft--brand">FR-08 · AI 可解释性</span>
        <span class="tag-soft tag-soft--teal"><span class="dot dot--teal"></span>2 轮模拟</span>
        <span class="t-xs muted">{{ tools.length }} 个工具 · {{ prompts.length }} 组 Prompt</span>
      </template>
      <template #actions>
        <el-button plain :loading="copyingSummary" @click="copySummary">
          <el-icon><CopyDocument /></el-icon>复制摘要
        </el-button>
        <el-button type="primary" @click="scrollTo('ai-compliance')">
          <el-icon><Lock /></el-icon>合规说明
        </el-button>
      </template>
    </PageHeader>

    <div v-if="loading" class="ai-skeleton">
      <div class="grid g4">
        <div v-for="index in 4" :key="`kpi-skeleton-${index}`" class="card card--pad">
          <el-skeleton animated :rows="2" />
        </div>
      </div>
      <div class="card card--pad">
        <el-skeleton animated :rows="4" />
      </div>
      <div class="card card--pad">
        <el-skeleton animated :rows="7" />
      </div>
    </div>

    <div v-else-if="pageError" class="card card--pad-lg ai-error">
      <span class="ai-error__icon"><el-icon><WarningFilled /></el-icon></span>
      <h3>AI 记录加载失败</h3>
      <p>{{ pageError }}</p>
      <div class="row wrap gap-3">
        <el-button type="primary" @click="load">重新加载</el-button>
        <el-button plain @click="router.push('/')">返回首页</el-button>
        <el-button text @click="router.push('/profile')">去个人资料重置</el-button>
      </div>
    </div>

    <template v-else>
      <div class="grid g4 ai-kpis">
        <StatTile
          label="累计调用"
          :value="stats.totalCalls"
          suffix="次"
          :hint="usageScope === 'all' ? '管理视角 · 全部用户实际调用' : '当前账号 · 实际调用日志'"
          tone="brand"
          class="lift"
        >
          <template #icon><el-icon><DataAnalysis /></el-icon></template>
        </StatTile>
        <StatTile
          label="意图识别准确率"
          :value="kpiAccuracy"
          suffix="%"
          :delta="`${delta.accuracy}pt`"
          :hint="accuracyHint"
          tone="teal"
          class="lift"
        >
          <template #icon><el-icon><CircleCheck /></el-icon></template>
        </StatTile>
        <StatTile
          label="平均响应"
          :value="kpiLatency"
          suffix="s"
          :delta="`${delta.latency}s`"
          delta-down
          :hint="latencyHint"
          tone="amber"
          class="lift ai-latency"
        >
          <template #icon><el-icon><Timer /></el-icon></template>
        </StatTile>
        <StatTile
          label="用户满意度"
          :value="kpiSatisfaction"
          :suffix="currentRound ? '%' : ''"
          :delta="`${delta.satisfaction}pt`"
          :hint="satisfactionHint"
          tone="coral"
          class="lift"
        >
          <template #icon><el-icon><StarFilled /></el-icon></template>
        </StatTile>
      </div>

      <div class="notice ai-notice">
        <span class="ai-notice__icon"><el-icon><MagicStick /></el-icon></span>
        <div class="ai-notice__text">
          <strong>AI 使用记录默认仅本人可见</strong>
          <p>工具、Prompt 与迭代说明属于公共能力文档；调用明细、Token 和错误信息按账号隔离。管理员需主动切换“全部用户”才能查看跨用户记录。</p>
        </div>
        <AiBadge text="AI 可解释性" ghost small />
      </div>

      <SectionCard
        title="实际调用记录"
        desc="默认仅展示当前账号的模型请求；管理员和高级管理员可主动切换到全用户管理视角。"
      >
        <template #actions>
          <el-radio-group
            v-if="canSwitchUsageScope"
            :model-value="usageScope"
            size="small"
            @change="changeUsageScope"
          >
            <el-radio-button value="own">仅本人</el-radio-button>
            <el-radio-button value="all">全部用户</el-radio-button>
          </el-radio-group>
          <span v-else class="tag-soft tag-soft--teal">仅本人数据</span>
        </template>

        <div v-if="aiRecord.usageLoading" class="card card--pad">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else-if="usageRecords.length" class="ai-usage-list">
          <div
            v-for="record in usageRecords"
            :key="record.id"
            class="ai-usage-row"
          >
            <span class="ai-usage-row__status" :class="`is-${record.status}`">
              {{ record.status === 'success' ? '成功' : '失败' }}
            </span>
            <div class="ai-usage-row__main">
              <strong>{{ taskLabel(record.task) }}</strong>
              <span class="t-xs muted">
                {{ record.scene || '自动识别' }} · {{ record.model || '本地引擎' }}
                <template v-if="usageScope === 'all'"> · {{ record.userName }}（{{ record.userStudentNo }}）</template>
                <template v-if="record.errorCode"> · {{ record.errorCode }}</template>
              </span>
            </div>
            <span class="mono t-xs">{{ record.latencyMs }} ms</span>
            <span class="mono t-xs">{{ record.usage?.total_tokens || '—' }} tokens</span>
            <time class="t-xs muted">{{ fmtDateTime(record.createdAt) }}</time>
          </div>
        </div>
        <EmptyState
          v-else
          compact
          title="当前范围内暂无调用记录"
          desc="发起一次 AI 解析或内容生成后，调用状态、模型、耗时与 Token 会记录在这里。"
        />
      </SectionCard>

      <SectionCard
        title="工具与版本"
        desc="从 DeepSeek 模型到前端依赖，再到本地降级引擎，每项工具的用途与版本都留档。"
      >
        <template #actions>
          <span class="tag-soft tag-soft--brand">{{ tools.length }} 项</span>
        </template>

        <div v-if="toolRows.length" class="tools-body">
          <div class="tools-strip">
            <span><el-icon><Cpu /></el-icon>已接入模型 <b>{{ modelCount }}</b></span>
            <span><el-icon><Document /></el-icon>工程依赖 <b>{{ depCount }}</b></span>
            <span><el-icon><Operation /></el-icon>本地引擎 <b>{{ localCalls }}</b> 次模拟调用</span>
          </div>

          <div class="tools-table only-desktop">
            <div class="tools-row tools-row--head">
              <span>工具</span>
              <span>用途</span>
              <span>版本</span>
              <span class="tools-row__calls">调用</span>
              <span>说明</span>
            </div>
            <div v-for="tool in toolRows" :key="tool.name" class="tools-row">
              <div class="tools-name">
                <span class="tools-icon"><el-icon><component :is="tool.icon" /></el-icon></span>
                <div class="tools-name__text">
                  <strong>{{ tool.name }}</strong>
                  <span>{{ isModelName(tool.name) ? '大模型 / AI 能力' : '工程依赖' }}</span>
                </div>
              </div>
              <span class="t-sm">{{ tool.purpose }}</span>
              <span class="mono t-sm tools-version">{{ tool.version }}</span>
              <span class="mono t-sm tools-row__calls">{{ tool.calls ? tool.calls : '—' }}</span>
              <div class="tools-status">
                <span class="tag-soft" :class="tool.tagClass">{{ tool.tagLabel }}</span>
                <span v-if="tool.note" class="tools-note">{{ tool.note }}</span>
              </div>
            </div>
          </div>

          <div class="tools-cards only-mobile">
            <div v-for="tool in toolRows" :key="`mobile-${tool.name}`" class="tool-card">
              <div class="tool-card__top">
                <span class="tools-icon"><el-icon><component :is="tool.icon" /></el-icon></span>
                <div class="tool-card__name">
                  <strong>{{ tool.name }}</strong>
                  <span>{{ tool.purpose }}</span>
                </div>
                <span class="tag-soft" :class="tool.tagClass">{{ tool.tagLabel }}</span>
              </div>
              <div class="tool-card__meta">
                <span>版本 <b class="mono">{{ tool.version }}</b></span>
                <span>调用 <b class="mono">{{ tool.calls ? tool.calls : '—' }}</b></span>
              </div>
              <p v-if="tool.note" class="tool-card__note">{{ tool.note }}</p>
            </div>
          </div>

          <p class="tools-foot">
            说明：配置 DeepSeek API Key 后，需求解析、论坛草稿、失物文案和讨论摘要会发起真实模型请求；失败时自动降级到本地规则。
          </p>
        </div>
        <EmptyState v-else title="暂无工具记录" desc="演示数据中还没有工具与版本信息。" compact />
      </SectionCard>

      <SectionCard title="关键 Prompt" desc="每条 Prompt 都可以复制复用，并附上它对应的设计效果与约束。">
        <template #actions>
          <AiBadge text="Prompt 可复制" ghost small />
        </template>

        <div class="prompt-intro notice">
          <el-icon><MagicStick /></el-icon>
          <p>Prompt 由「场景 + 约束 + 输出格式」三段组成，保证解析结果可视、可改，避免黑箱。</p>
        </div>

        <el-collapse v-if="prompts.length" v-model="openPrompt" accordion class="prompt-collapse">
          <el-collapse-item v-for="(prompt, index) in prompts" :key="prompt.id" :name="prompt.id">
            <template #title>
              <div class="prompt-head">
                <span class="prompt-num mono">{{ `P0${index + 1}` }}</span>
                <div class="prompt-head__text">
                  <strong>{{ prompt.title }}</strong>
                  <span>{{ prompt.scene }}</span>
                </div>
                <span class="tag-soft tag-soft--brand prompt-scene">{{ prompt.scene }}</span>
              </div>
            </template>

            <div class="prompt-body">
              <div class="prompt-code">
                <div class="prompt-code__bar">
                  <span class="prompt-code__dots"><i></i><i></i><i></i></span>
                  <span class="mono prompt-code__tag">system prompt</span>
                  <el-button text size="small" class="prompt-copy" @click.stop="copyPrompt(prompt)">
                    <el-icon>
                      <CircleCheck v-if="copiedId === prompt.id" />
                      <CopyDocument v-else />
                    </el-icon>
                    {{ copiedId === prompt.id ? '已复制' : '复制' }}
                  </el-button>
                </div>
                <pre class="mono">{{ prompt.content }}</pre>
              </div>

              <div class="prompt-effect">
                <span class="prompt-effect__icon"><el-icon><CircleCheck /></el-icon></span>
                <div>
                  <strong>设计效果</strong>
                  <p>{{ prompt.note }}</p>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
        <EmptyState v-else title="暂无 Prompt 记录" desc="演示数据尚未载入关键 Prompt。" compact />
      </SectionCard>

      <SectionCard title="两轮迭代对比" desc="同一批演示任务下的前后对比，指标、问题与改动都保留下来。">
        <template #actions>
          <span v-if="currentRound" class="tag-soft tag-soft--brand">
            第 {{ currentRound.round }} / {{ rounds.length }} 轮
          </span>
        </template>

        <template v-if="rounds.length">
          <div class="round-tabs" role="tablist" aria-label="迭代轮次">
            <button
              v-for="round in rounds"
              :key="round.round"
              type="button"
              class="round-tab"
              :class="{ 'is-active': aiRecord.activeRound === round.round }"
              role="tab"
              :aria-selected="aiRecord.activeRound === round.round"
              @click="aiRecord.setRound(round.round)"
            >
              <span class="round-tab__num mono">{{ String(round.round).padStart(2, '0') }}</span>
              <span class="round-tab__text">
                <strong>第 {{ round.round }} 轮</strong>
                <small>{{ round.title }}</small>
              </span>
              <span v-if="aiRecord.activeRound === round.round" class="round-tab__now">查看中</span>
            </button>
          </div>

          <div v-if="currentRound" class="iter-body">
            <div class="iter-banner">
              <div>
                <span class="tag-soft tag-soft--brand">第 {{ currentRound.round }} 轮 · {{ currentRound.date }}</span>
                <h3>{{ currentRound.title }}</h3>
                <p>样本与指标均来自本地演示，用于说明两轮优化前后的差异。</p>
              </div>
              <AiBadge text="模拟指标 · 演示数据" ghost small />
            </div>

            <div class="grid g3 iter-metrics">
              <div v-for="metric in metrics" :key="metric.key" class="iter-metric">
                <div class="iter-metric__head">
                  <span>{{ metric.label }}</span>
                  <span class="iter-metric__delta">{{ metric.deltaText }}</span>
                </div>
                <div class="iter-metric__values">
                  <div class="iter-metric__col">
                    <small>优化前</small>
                    <b>{{ metric.beforeText }}</b>
                  </div>
                  <span class="iter-metric__arrow"><el-icon><ArrowRight /></el-icon></span>
                  <div class="iter-metric__col is-after">
                    <small>优化后</small>
                    <b>{{ metric.afterText }}</b>
                  </div>
                </div>
                <div class="iter-meter" aria-hidden="true">
                  <span class="iter-meter__bar is-before" :style="{ width: `${metric.beforeBar}%` }"></span>
                  <span class="iter-meter__bar is-after" :style="{ width: `${metric.afterBar}%` }"></span>
                </div>
                <p class="iter-metric__hint">{{ metric.hint }}</p>
              </div>
            </div>

            <div class="iter-compare">
              <div class="iter-compare__head">
                <div>
                  <strong>数值对比</strong>
                  <span class="t-xs faint">浅色 = 优化前 · 紫色 = 优化后</span>
                </div>
                <span class="t-xs muted">按指标最大值归一化</span>
              </div>
              <div class="bar-chart">
                <div v-for="metric in metrics" :key="`bar-${metric.key}`" class="bar-group">
                  <div class="bar-group__label">
                    <strong>{{ metric.short }}</strong>
                    <span>{{ metric.label }}</span>
                  </div>
                  <div class="bar-group__lines">
                    <div class="bar-line">
                      <span class="bar bar--before" :style="{ width: `${metric.beforeBar}%` }"></span>
                      <i class="bar-value mono">{{ metric.beforeText }}</i>
                    </div>
                    <div class="bar-line">
                      <span class="bar bar--after" :style="{ width: `${metric.afterBar}%` }"></span>
                      <i class="bar-value mono">{{ metric.afterText }}</i>
                    </div>
                  </div>
                  <span class="bar-group__delta mono">{{ metric.deltaText }}</span>
                </div>
              </div>
            </div>

            <div class="grid g2 iter-lists">
              <div class="iter-panel">
                <div class="iter-panel__head">
                  <span class="iter-panel__icon is-coral"><el-icon><WarningFilled /></el-icon></span>
                  <div>
                    <strong>问题清单</strong>
                    <p>优化前暴露的问题，以及本轮仍需关注的点</p>
                  </div>
                </div>
                <div class="issue-block">
                  <span class="issue-label is-before">优化前 · {{ currentRound.before.issues.length }} 项</span>
                  <ul>
                    <li v-for="(issue, index) in currentRound.before.issues" :key="`before-${index}`">{{ issue }}</li>
                  </ul>
                </div>
                <div class="issue-block">
                  <span class="issue-label is-after">仍待优化 · {{ currentRound.after.issues.length }} 项</span>
                  <ul>
                    <li v-for="(issue, index) in currentRound.after.issues" :key="`after-${index}`">{{ issue }}</li>
                  </ul>
                </div>
              </div>

              <div class="iter-panel">
                <div class="iter-panel__head">
                  <span class="iter-panel__icon is-teal"><el-icon><Operation /></el-icon></span>
                  <div>
                    <strong>关键改动</strong>
                    <p>本轮针对问题做的工程与交互调整</p>
                  </div>
                </div>
                <ol class="change-list">
                  <li v-for="(change, index) in currentRound.changes" :key="`change-${index}`">
                    <span class="change-num mono">{{ index + 1 }}</span>
                    <p>{{ change }}</p>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <EmptyState v-else title="暂无迭代详情" desc="当前轮次的数据尚未载入。" compact />
        </template>

        <EmptyState v-else title="暂无迭代记录" desc="演示数据尚未包含两轮迭代对比。" compact />
      </SectionCard>

      <SectionCard title="调用统计" :desc="usageScope === 'all' ? '管理视角下全部用户近 7 日实际调用。' : '当前账号近 7 日实际调用，默认不包含其他用户数据。'">
        <template #actions>
          <span class="tag-soft tag-soft--teal"><span class="dot dot--teal"></span>{{ usageScope === 'all' ? '全部用户' : '当前账号' }}</span>
        </template>

        <div class="stats-grid">
          <div class="stats-chart">
            <div class="stats-chart__head">
              <div>
                <strong>近 7 日调用</strong>
                <p>单位：次 / 日 · 本地演示累计</p>
              </div>
              <span v-if="trendText" class="stats-trend">{{ trendText }}</span>
            </div>

            <div v-if="stats.daily && stats.daily.length" class="daily-chart">
              <div
                v-for="(count, index) in stats.daily"
                :key="`daily-${index}`"
                class="daily-col"
                :class="{ 'is-today': index === stats.daily.length - 1 }"
              >
                <span class="daily-value mono">{{ count }}</span>
                <div class="daily-track">
                  <span class="daily-bar" :style="{ height: `${barHeight(count)}%` }"></span>
                </div>
                <span class="daily-label">{{ dayLabels[index] }}</span>
              </div>
            </div>
            <EmptyState v-else title="暂无调用趋势" desc="演示数据中还没有每日调用记录。" compact />

            <div class="stats-foot">
              <span><i class="dot dot--brand"></i>规则引擎调用</span>
              <span>最后更新：{{ todayLabel }}</span>
            </div>
          </div>

          <div class="stats-side">
            <div class="stats-side__top">
              <ProgressRing :value="successRatePct" :size="76" :stroke="7" tone="teal" caption="成功率" />
              <div>
                <strong>整体成功率</strong>
                <p>目标 ≥ 90%，当前 {{ successRatePct }}%</p>
                <span class="tag-soft" :class="successRatePct >= 90 ? 'tag-soft--teal' : 'tag-soft--amber'">
                  {{ successRatePct >= 90 ? '已达标' : '接近目标' }}
                </span>
              </div>
            </div>

            <dl class="stats-list">
              <div>
                <dt>总调用次数</dt>
                <dd class="mono">{{ stats.totalCalls }} 次</dd>
              </div>
              <div>
                <dt>平均响应</dt>
                <dd class="mono">{{ stats.avgLatency }}</dd>
              </div>
              <div>
                <dt>Token 消耗</dt>
                <dd class="mono">{{ stats.tokens }}</dd>
              </div>
              <div>
                <dt>累计成本</dt>
                <dd class="mono">{{ stats.cost }}</dd>
              </div>
            </dl>

            <p class="stats-note">调用统计为演示展示值；真实调用量和费用以 DeepSeek 控制台账单为准。</p>
          </div>
        </div>
      </SectionCard>

      <div id="ai-compliance" class="ai-compliance-anchor">
        <SectionCard
          title="合规与隐私"
          desc="AI 生成内容必须可标识、数据必须最小化、关键决策必须有人工确认。"
        >
          <template #actions>
            <AiBadge text="全部 AI 内容已标识" ghost small />
          </template>

          <div class="compliance-grid">
            <div class="compliance-side">
              <span class="compliance-side__icon"><el-icon><Lock /></el-icon></span>
              <span class="compliance-side__kicker">PRIVACY BY DESIGN</span>
              <h3>不拿真实隐私<br />换一次便利</h3>
              <p>业务数据由后端共享同步；API Key 加密保存，生成内容在发布前均可人工核对。</p>
              <ul>
                <li><el-icon><CircleCheck /></el-icon>学号仅展示前 4 后 2</li>
                <li><el-icon><CircleCheck /></el-icon>联系方式默认打码</li>
                <li><el-icon><CircleCheck /></el-icon>低置信度强制人工确认</li>
              </ul>
              <AiBadge text="演示数据 · 不含真实隐私" ghost small />
            </div>

            <div class="compliance-list">
              <div v-for="(item, index) in complianceItems" :key="`compliance-${index}`" class="compliance-item">
                <span class="compliance-item__icon" :class="item.tone">
                  <el-icon><component :is="item.icon" /></el-icon>
                </span>
                <div class="compliance-item__text">
                  <div class="compliance-item__title">
                    <strong>{{ item.title }}</strong>
                    <AiBadge v-if="item.isAi" text="AI 生成" ghost small />
                    <span class="tag-soft compliance-item__tag" :class="item.tagClass">{{ item.tag }}</span>
                  </div>
                  <p>{{ item.text }}</p>
                </div>
              </div>

              <div class="compliance-foot">
                <AiBadge text="AI 生成" small />
                <p>依据方案 FR-08 与非功能需求：AI 输出可解释、可更正、可追溯；关键结果必须经过人工确认。</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ai {
  gap: 16px;
}

/* ---------- 加载 / 错误 ---------- */
.ai-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-error {
  text-align: center;
  padding: 48px 24px;
}

.ai-error__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: var(--coral-50);
  color: var(--coral-600);
  font-size: 24px;
  margin-bottom: 12px;
}

.ai-error h3 {
  margin: 0 0 4px;
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-1);
}

.ai-error p {
  margin: 0 auto 16px;
  max-width: 520px;
  font-size: var(--fs-sm);
  line-height: 1.7;
  color: var(--text-2);
}

.ai-error .row {
  justify-content: center;
}

/* ---------- KPI ---------- */
.ai-kpis {
  gap: 16px;
}

.ai-latency :deep(.stat__delta--down) {
  background: var(--teal-50);
  color: var(--teal-600);
}

/* ---------- 说明条 ---------- */
.ai-notice {
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--brand-100);
  flex-wrap: wrap;
}

.ai-notice__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  background: var(--surface);
  color: var(--brand-600);
  box-shadow: var(--shadow-xs);
  font-size: 18px;
}

.ai-notice__text {
  flex: 1;
  min-width: 200px;
}

.ai-notice__text strong {
  display: block;
  font-size: var(--fs-sm);
  color: var(--text-1);
}

.ai-notice__text p {
  margin: 0px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-2);
}

.ai-notice > .ai-badge {
  flex: none;
}

/* ---------- 实际调用记录 ---------- */
.ai-usage-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-usage-row {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) 72px 88px 104px;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

/* 耗时 / Token / 时间对齐成列，读起来像一张表而不是散落的卡片 */
.ai-usage-row > .mono,
.ai-usage-row > time {
  justify-self: end;
  text-align: right;
}

.ai-usage-row__status {
  min-width: 42px;
  padding: 4px 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  color: var(--teal-600);
  background: var(--teal-50);
}

.ai-usage-row__status.is-error {
  color: var(--coral-600);
  background: var(--coral-50);
}

.ai-usage-row__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-usage-row__main strong {
  color: var(--text-1);
}

.ai-usage-row__main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 工具与版本 ---------- */
.tools-body {
  min-width: 0;
}

.tools-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-2);
}

.tools-strip span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tools-strip .el-icon {
  color: var(--text-3);
  font-size: 14px;
}

.tools-strip b {
  color: var(--text-1);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tools-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}

.tools-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 0.85fr) 58px minmax(0, 1.25fr);
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border-bottom: 1px solid var(--line);
  min-width: 0;
  transition: background var(--dur) var(--ease-out);
}

.tools-row:last-child {
  border-bottom: none;
}

.tools-row:not(.tools-row--head):hover {
  background: var(--brand-50);
}

.tools-row--head {
  background: var(--surface-2);
  padding: 8px 12px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.tools-row__calls {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.tools-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tools-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 18px;
}

.tools-name__text {
  min-width: 0;
}

.tools-name__text strong {
  display: block;
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.35;
}

.tools-name__text span {
  display: block;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.4;
}

.tools-version {
  color: var(--text-2);
  word-break: break-word;
}

.tools-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.tools-note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.tools-foot {
  margin: 12px 0px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.tools-cards {
  display: none;
  flex-direction: column;
  gap: 8px;
}

.tool-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 12px;
  background: var(--surface);
}

.tool-card__top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tool-card__name {
  flex: 1;
  min-width: 0;
}

.tool-card__name strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.4;
}

.tool-card__name span {
  display: block;
  margin-top: 0px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
}

.tool-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-3);
}

.tool-card__meta b {
  color: var(--text-2);
  font-weight: 600;
}

.tool-card__note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- Prompt ---------- */
.prompt-intro {
  margin-bottom: 4px;
  align-items: center;
}

.prompt-intro p {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.prompt-collapse {
  border: none;
  --el-collapse-border-color: transparent;
}

.prompt-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 64px;
  padding: 12px 4px;
  background: transparent;
  border-bottom: 1px solid var(--line);
  line-height: 1.4;
}

.prompt-collapse :deep(.el-collapse-item__header:hover) {
  background: var(--surface-2);
}

.prompt-collapse :deep(.el-collapse-item__header.is-active) {
  border-bottom-color: var(--brand-100);
}

.prompt-collapse :deep(.el-collapse-item__arrow) {
  margin-left: 8px;
  color: var(--text-3);
}

.prompt-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: 1px solid var(--line);
}

.prompt-collapse :deep(.el-collapse-item:last-child .el-collapse-item__header),
.prompt-collapse :deep(.el-collapse-item:last-child .el-collapse-item__wrap) {
  border-bottom: none;
}

.prompt-collapse :deep(.el-collapse-item__content) {
  padding: 4px 0 16px;
}

.prompt-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding-right: 4px;
}

.prompt-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.prompt-head__text {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.prompt-head__text strong {
  display: block;
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.4;
}

.prompt-head__text span {
  display: block;
  margin-top: 0px;
  font-size: 12px;
  color: var(--text-3);
}

.prompt-scene {
  flex: none;
}

.prompt-body {
  animation: fade-up 0.32s var(--ease-out);
}

.prompt-code {
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--ink-900);
  box-shadow: none;
}

.prompt-code__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.prompt-code__dots {
  display: inline-flex;
  gap: 4px;
}

.prompt-code__dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--coral-500);
  opacity: 0.85;
}

.prompt-code__dots i:nth-child(2) {
  background: var(--amber-500);
}

.prompt-code__dots i:nth-child(3) {
  background: var(--teal-500);
}

.prompt-code__tag {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(246, 241, 231, 0.5);
}

.prompt-copy {
  margin-left: auto;
  color: rgba(246, 241, 231, 0.82);
  font-size: 12px;
}

.prompt-code__bar :deep(.el-button) {
  color: rgba(246, 241, 231, 0.82);
  font-size: 12px;
  height: 26px;
  padding: 0 8px;
}

.prompt-code__bar :deep(.el-button:hover) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.prompt-code pre {
  margin: 0;
  padding: 16px 16px;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.8;
  color: rgba(246, 241, 231, 0.86);
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-code pre::-webkit-scrollbar {
  width: 6px;
}

.prompt-code pre::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
}

.prompt-effect {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 12px;
  border-radius: 8px;
  background: var(--brand-50);
}

.prompt-effect__icon {
  display: inline-flex;
  color: var(--teal-600);
  font-size: 18px;
  flex: none;
  margin-top: 0px;
}

.prompt-effect strong {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--brand-700);
  letter-spacing: 0.02em;
}

.prompt-effect p {
  margin: 0px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

/* ---------- 迭代 ---------- */
.round-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.round-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--dur), background var(--dur), box-shadow var(--dur), transform var(--dur);
}

.round-tab:hover {
  border-color: var(--brand-300);
  background: var(--brand-50);
}

.round-tab.is-active {
  border-color: var(--brand-300);
  background: var(--brand-50);
  box-shadow: var(--shadow-sm);
}

.round-tab__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}

.round-tab.is-active .round-tab__num {
  background: var(--brand-500);
  color: #fff;
  box-shadow: none;
}

.round-tab__text {
  flex: 1;
  min-width: 0;
}

.round-tab__text strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.round-tab__text small {
  display: block;
  margin-top: 0px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.round-tab__now {
  flex: none;
  padding: 0px 8px;
  border-radius: var(--radius-pill);
  background: var(--brand-500);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.iter-body {
  animation: fade-up 0.34s var(--ease-out);
}

.iter-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  margin-bottom: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--brand-100);
  background: var(--brand-50);
}

.iter-banner h3 {
  margin: 8px 0 4px;
  font-size: var(--fs-lg);
  font-weight: 700;
  letter-spacing: 0;
  color: var(--text-1);
}

.iter-banner p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.iter-banner > .ai-badge {
  flex: none;
}

.iter-metrics {
  gap: 12px;
}

.iter-metric {
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.iter-metric__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
}

.iter-metric__delta {
  flex: none;
  padding: 0px 8px;
  border-radius: var(--radius-pill);
  background: var(--teal-50);
  color: var(--teal-600);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.iter-metric__values {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.iter-metric__col {
  min-width: 0;
}

.iter-metric__col small {
  display: block;
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 0px;
}

.iter-metric__col b {
  display: block;
  font-size: var(--fs-2xl);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.1;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.iter-metric__col.is-after {
  text-align: right;
}

.iter-metric__col.is-after b {
  color: var(--brand-600);
}

.iter-metric__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-4);
  font-size: 12px;
  border: 1px solid var(--line);
}

.iter-meter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.iter-meter__bar {
  height: 6px;
  border-radius: var(--radius-pill);
  transition: width 0.7s var(--ease-out);
}

.iter-meter__bar.is-before {
  background: var(--brand-200);
}

.iter-meter__bar.is-after {
  background: var(--grad-brand);
}

.iter-metric__hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.iter-compare {
  margin-top: 16px;
  padding: 16px 16px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
}

.iter-compare__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.iter-compare__head strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.iter-compare__head span {
  display: block;
  line-height: 1.5;
}

.bar-group {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) 58px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.bar-group:last-child {
  border-bottom: none;
}

.bar-group__label {
  min-width: 0;
}

.bar-group__label strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.bar-group__label span {
  display: block;
  margin-top: 0px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-group__lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bar-line {
  position: relative;
  display: flex;
  align-items: center;
  height: 17px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width 0.7s var(--ease-out);
}

.bar--before {
  background: var(--brand-200);
}

.bar--after {
  background: var(--grad-brand);
}

.bar-value {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.bar-group__delta {
  text-align: right;
  font-size: 12px;
  font-weight: 700;
  color: var(--teal-600);
  white-space: nowrap;
}

.iter-lists {
  margin-top: 16px;
  gap: 12px;
}

.iter-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.iter-panel__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.iter-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  font-size: 18px;
}

.iter-panel__icon.is-coral {
  background: var(--coral-50);
  color: var(--coral-600);
}

.iter-panel__icon.is-teal {
  background: var(--teal-50);
  color: var(--teal-600);
}

.iter-panel__head strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.iter-panel__head p {
  margin: 0px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.issue-block {
  margin-top: 12px;
}

.issue-label {
  display: inline-flex;
  padding: 0px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
}

.issue-label.is-before {
  background: var(--coral-50);
  color: var(--coral-600);
}

.issue-label.is-after {
  background: var(--amber-50);
  color: var(--amber-600);
}

.issue-block ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.issue-block li {
  position: relative;
  padding-left: 12px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
}

.issue-block li::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--coral-500);
}

.issue-block:last-child li::before {
  background: var(--amber-500);
}

.change-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.change-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.change-list li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.change-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  margin-top: 0px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.change-list p {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

/* ---------- 调用统计 ---------- */
.stats-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
}

.stats-chart {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.stats-chart__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.stats-chart__head strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.stats-chart__head p {
  margin: 0px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.stats-trend {
  flex: none;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--teal-50);
  color: var(--teal-600);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.daily-chart {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.daily-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.daily-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.daily-track {
  width: 100%;
  height: 118px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.daily-bar {
  width: min(64%, 32px);
  min-height: 4px;
  border-radius: 8px 8px 4px 4px;
  background: var(--brand-200);
  transition: height 0.7s var(--ease-out), background var(--dur);
}

.daily-col.is-today .daily-bar {
  background: var(--grad-brand);
  box-shadow: none;
}

.daily-col.is-today .daily-value {
  color: var(--brand-600);
}

.daily-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.stats-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-3);
}

.stats-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stats-foot .dot {
  width: 5px;
  height: 5px;
}

.stats-side {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.stats-side__top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.stats-side__top strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.stats-side__top p {
  margin: 0px 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.stats-list {
  margin: 4px 0 0;
}

.stats-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.stats-list > div:last-child {
  border-bottom: none;
}

.stats-list dt {
  font-size: 12px;
  color: var(--text-3);
}

.stats-list dd {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  text-align: right;
}

.stats-note {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- 合规 ---------- */
.ai-compliance-anchor {
  scroll-margin-top: calc(var(--topbar-h) + 18px);
}

.compliance-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr);
  gap: 16px;
  min-width: 0;
}

.compliance-side {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 24px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text-1);
}

.compliance-side__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 20px;
  border: 1px solid var(--brand-100);
}

.compliance-side__kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--text-4);
}

.compliance-side h3 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--fs-xl);
  font-weight: 600;
  line-height: 1.28;
  letter-spacing: 0;
}

.compliance-side > p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.compliance-side ul {
  list-style: none;
  margin: 4px 0 0px;
  padding: 0;
}

.compliance-side li {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
}

.compliance-side li .el-icon {
  color: var(--brand-600);
  font-size: 14px;
  flex: none;
}

.compliance-side > .ai-badge {
  margin-top: auto;
}

.compliance-list {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}

.compliance-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}

.compliance-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 8px;
  font-size: 18px;
}

.compliance-item__icon.is-brand {
  background: var(--brand-50);
  color: var(--brand-600);
}

.compliance-item__icon.is-teal {
  background: var(--teal-50);
  color: var(--teal-600);
}

.compliance-item__icon.is-amber {
  background: var(--amber-50);
  color: var(--amber-600);
}

.compliance-item__icon.is-neutral {
  background: var(--surface-3);
  color: var(--text-2);
}

.compliance-item__text {
  flex: 1;
  min-width: 0;
}

.compliance-item__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.compliance-item__title strong {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.compliance-item__tag {
  margin-left: auto;
}

.compliance-item__text p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

.compliance-foot {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: var(--surface-2);
}

.compliance-foot p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .stats-grid,
  .compliance-grid {
    grid-template-columns: 1fr;
  }

  .compliance-side {
    min-height: 0;
  }

  .compliance-side > .ai-badge {
    margin-top: 4px;
  }
}

@media (max-width: 1080px) {
  .tools-table {
    display: none !important;
  }

  .tools-cards {
    display: flex !important;
  }
}

@media (max-width: 900px) {
  .tools-table {
    display: none;
  }

  .tools-cards {
    display: flex;
  }
}

@media (max-width: 640px) {
  .ai {
    gap: 16px;
  }

  .ai-notice {
    align-items: flex-start;
    padding: 12px 12px;
  }

  .ai-notice > .ai-badge {
    display: none;
  }

  .prompt-scene {
    display: none;
  }

  .prompt-head {
    gap: 8px;
    padding-right: 0px;
  }

  .prompt-num {
    width: 30px;
    height: 30px;
    font-size: 12px;
  }

  .prompt-head__text strong {
    font-size: 13px;
  }

  .prompt-code pre {
    padding: 12px 12px;
    font-size: 12px;
    max-height: 280px;
  }

  .round-tabs {
    flex-direction: column;
    gap: 8px;
  }

  .round-tab {
    padding: 8px 12px;
  }

  .round-tab__text small {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .iter-banner {
    flex-direction: column;
    padding: 12px;
  }

  .iter-metric__col b {
    font-size: var(--fs-xl);
  }

  .iter-compare {
    padding: 12px;
  }

  .bar-group {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 8px;
  }

  .bar-group__lines {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .bar-group__label span {
    display: inline;
    margin-left: 4px;
  }

  .iter-lists {
    margin-top: 12px;
  }

  .stats-chart,
  .stats-side {
    padding: 12px;
  }

  .daily-chart {
    gap: 4px;
  }

  .daily-track {
    height: 104px;
  }

  .daily-value {
    font-size: 12px;
  }

  .daily-label {
    font-size: 12px;
  }

  .stats-chart__head {
    flex-direction: column;
    gap: 4px;
  }

  .stats-trend {
    align-self: flex-start;
  }

  .compliance-side {
    padding: 16px;
  }

  .compliance-side h3 {
    font-size: var(--fs-xl);
  }

  .compliance-item {
    padding: 12px;
    gap: 8px;
  }

  .compliance-item__icon {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .compliance-item__tag {
    margin-left: 0;
  }

  .compliance-foot {
    padding: 12px 12px;
  }
}

@media (max-width: 720px) {
  .ai-usage-row {
    grid-template-columns: auto 1fr;
    gap: 8px 8px;
  }

  .ai-usage-row__main {
    min-width: 0;
  }

  .ai-usage-row > .mono,
  .ai-usage-row > time {
    grid-column: span 1;
  }
}
</style>
