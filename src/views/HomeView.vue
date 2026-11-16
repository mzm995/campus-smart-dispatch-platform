<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Bell,
  Calendar,
  ChatLineRound,
  CircleCheck,
  ChatDotRound,
  MagicStick,
  Promotion,
  Search,
  TrendCharts,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import SceneTile from '@/components/SceneTile.vue'
import SceneIcon from '@/components/SceneIcon.vue'
import StatusPill from '@/components/StatusPill.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import CountdownText from '@/components/CountdownText.vue'
import AvatarStack from '@/components/AvatarStack.vue'
import AiBadge from '@/components/AiBadge.vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { useClassroomStore } from '@/stores/classroom'
import { useLostfoundStore } from '@/stores/lostfound'
import { useGroupBuyStore } from '@/stores/groupbuy'
import { useForumStore } from '@/stores/forum'
import { useDispatchStore } from '@/stores/dispatch'
import { SCENE_LIST } from '@/utils/aiEngine'
import { fmtDate, timeAgo, WEEK_CN } from '@/utils/format'
import { CAMPUS } from '@/mock/campus'

const router = useRouter()
const app = useAppStore()
const user = useUserStore()
const notify = useNotifyStore()
const classroom = useClassroomStore()
const lostfound = useLostfoundStore()
const groupbuy = useGroupBuyStore()
const forum = useForumStore()
const dispatch = useDispatchStore()

const text = ref('')
const allExamples = [
  '周四下午借一间 40 人带投影的教室开班会',
  '在A栋丢了一个蓝色水杯，杯身有贴纸',
  '校门口奶茶拼单，6.5 一杯，还差 4 杯',
  '学生超市周末营业到几点',
]
const examples = computed(() =>
  user.canAccess('classroom')
    ? allExamples
    : allExamples.filter((item) => !/教室|借一间/.test(item)),
)
const sceneList = computed(() =>
  SCENE_LIST.filter((item) => item.key !== 'classroom' || user.canAccess('classroom')),
)

const hour = new Date().getHours()
const greeting = computed(() => {
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const today = computed(() => {
  const d = new Date()
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEK_CN[d.getDay() === 0 ? 7 : d.getDay()]}`
})

const firstName = computed(() => user.user?.name || '同学')
const kpis = computed(() => [
  ...(user.canAccess('classroom')
    ? [{
    label: '待审核申请',
    value: classroom.stats.pending,
    suffix: '单',
    hint: `共 ${classroom.stats.total} 条借用记录`,
    tone: 'amber',
    icon: Calendar,
    to: '/classroom/status',
  }]
    : []),
  {
    label: '未读通知',
    value: notify.unreadCount,
    suffix: '条',
    hint: `${notify.importantUnread} 条标记为重要`,
    tone: 'coral',
    icon: Bell,
    to: '/notifications',
  },
  {
    label: '进行中拼单',
    value: groupbuy.stats.ongoing,
    suffix: '个',
    hint: `已参与 ${groupbuy.stats.joined} 个`,
    tone: 'teal',
    icon: Promotion,
    to: '/groupbuy',
  },
  {
    label: '论坛待回复',
    value: forum.stats.pending,
    suffix: '条',
    hint: `今日新增 ${forum.stats.today} 条帖子`,
    tone: 'brand',
    icon: ChatDotRound,
    to: '/forum',
  },
])

const sceneStats = computed(() => ({
  classroom: `${classroom.rooms.length} 处场地 · ${classroom.stats.pending} 待审核`,
  lostfound: `${lostfound.openCount} 条进行中 · ${lostfound.topPairs.length} 组高相似`,
  groupbuy: `${groupbuy.stats.ongoing} 个进行中 · 待接龙`,
  forum: `${forum.stats.total} 条帖子 · ${forum.stats.pending} 条待回复`,
}))

const todos = computed(() => {
  const apps = user.canAccess('classroom') ? classroom.applications.slice(0, 3).map((a) => ({
    id: a.id,
    type: '教室申请',
    title: `${a.building} ${a.roomCode} · ${a.purpose}`,
    desc: `${a.date} ${a.start}–${a.end} · ${a.people} 人`,
    status: a.status,
    to: `/classroom/status/${a.id}`,
    tone: 'brand',
  })) : []
  const threads = forum.unanswered.slice(0, 2).map((p) => ({
    id: p.id,
    type: '论坛待回复',
    title: p.title,
    desc: `${p.category} · ${timeAgo(p.createdAt)} · 还没有回复`,
    status: 'open',
    to: `/forum/${p.id}`,
    tone: 'coral',
  }))
  return [...threads, ...apps].slice(0, 4)
})

const notices = computed(() => notify.items.slice(0, 4))
const ongoingList = computed(() => groupbuy.ongoing.slice(0, 3))
const pairs = computed(() => lostfound.topPairs.slice(0, 2))
const records = computed(() => dispatch.recent.slice(0, 4))

const pipeline = [
  { key: 'parse', title: '需求解析', desc: '自然语言 → 结构化意图', icon: MagicStick },
  { key: 'match', title: '智能匹配', desc: '资源检索 + 规则可信化', icon: Search },
  { key: 'build', title: '结果生成', desc: '方案 / 文案 / 帖子', icon: CircleCheck },
  { key: 'push', title: '自动通知', desc: '站内信 + 重要提醒', icon: ChatLineRound },
]

function submit() {
  const value = text.value.trim()
  if (!value) {
    ElMessage.warning('先用一句话描述你的需求，例如「周四下午借间教室」')
    return
  }
  app.openAiDialog(value)
  text.value = ''
}

function useExample(item) {
  text.value = item
  submit()
}

function openNotice(item) {
  notify.markRead(item.id)
  router.push(item.link || '/notifications')
}
</script>

<template>
  <div class="page home">
    <!-- ============ Hero ============ -->
    <section class="hero">
      <div class="hero__body">
        <div class="hero__main">
          <div class="hero__eyebrow">
            <span class="dot dot--brand"></span>
            {{ today }} · 东校区 · AI 调度中枢在线
          </div>
           <h1 class="hero__title">
            {{ greeting }}，{{ firstName }}。<br />
            <span class="hero__title-soft">把需求说清楚，剩下的交给 AI。</span>
          </h1>
          <p class="hero__desc">
            一句话描述需求，AI 自动完成<span class="hero__hl">意图解析</span>、
            <span class="hero__hl">资源匹配</span>、<span class="hero__hl">结果生成</span>与
            <span class="hero__hl">消息通知</span>。
          </p>

          <div class="hero__input" :class="{ 'is-focus': text }">
            <span class="hero__input-orb"><el-icon :size="17"><MagicStick /></el-icon></span>
            <input
              v-model="text"
              class="hero__input-field"
              placeholder="例如：周四下午想借一间 40 人、带投影的教室开班会"
              maxlength="80"
              @keyup.enter="submit"
            />
            <span class="hero__input-kbd">⌘K</span>
            <button type="button" class="hero__submit" @click="submit">
              开始调度
              <el-icon :size="13"><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="hero__chips">
            <span class="hero__chips-label">试试这样说</span>
            <button v-for="item in examples.slice(0, 4)" :key="item" type="button" class="hero__chip" @click="useExample(item)">
              {{ item }}
            </button>
          </div>
        </div>

        <div class="hero__side">
          <div class="hero__side-card">
            <div class="hero__side-head">
              <span class="hero__side-title">AI 调度流水线</span>
              <span class="hero__side-live"><i></i>实时</span>
            </div>
            <div class="hero__pipe">
              <div v-for="(step, index) in pipeline" :key="step.key" class="hero__pipe-item">
                <span class="hero__pipe-icon"><el-icon :size="13"><component :is="step.icon" /></el-icon></span>
                <span class="hero__pipe-meta">
                  <span class="hero__pipe-title">{{ step.title }}</span>
                  <span class="hero__pipe-desc">{{ step.desc }}</span>
                </span>
                <span class="hero__pipe-index">0{{ index + 1 }}</span>
              </div>
            </div>
            <div class="hero__side-foot">
              <span>累计调度 <b>{{ dispatch.records.length }}</b> 次</span>
              <span>平均 <b>2.3s</b> 返回</span>
            </div>
          </div>
        </div>
      </div>

      <div class="hero__metrics">
        <div class="hero__metric">
          <span class="hero__metric-label">意图解析成功率</span>
          <span class="hero__metric-value">91<span>%</span></span>
          <span class="hero__metric-delta">两轮迭代 +23pt</span>
        </div>
        <div class="hero__metric">
          <span class="hero__metric-label">平均调度耗时</span>
          <span class="hero__metric-value">2.3<span>s</span></span>
          <span class="hero__metric-delta">目标 ≤30s</span>
        </div>
        <div class="hero__metric">
          <span class="hero__metric-label">方案采纳率</span>
          <span class="hero__metric-value">86<span>%</span></span>
          <span class="hero__metric-delta">基于匹配记录统计</span>
        </div>
        <div class="hero__metric hero__metric--cta" @click="router.push('/ai-record')">
          <span class="hero__metric-label">AI 使用记录</span>
          <span class="hero__metric-link">查看迭代对比 <el-icon :size="12"><ArrowRight /></el-icon></span>
        </div>
      </div>
    </section>

    <!-- ============ KPI ============ -->
    <div class="grid g-auto home__kpis mt-5">
      <StatTile
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :suffix="kpi.suffix"
        :hint="kpi.hint"
        :tone="kpi.tone"
        class="lift"
        style="cursor: pointer"
        @click="router.push(kpi.to)"
      >
        <template #icon>
          <el-icon :size="16"><component :is="kpi.icon" /></el-icon>
        </template>
      </StatTile>
    </div>

    <!-- ============ 场景 ============ -->
    <section class="page-section">
      <div class="section-head">
        <div>
          <h2 class="section-head__title">{{ user.canAccess('classroom') ? '四大场景，一句话直达' : '校园协作场景，一句话直达' }}</h2>
          <p class="section-head__desc">每个场景都共享同一套 AI 调度能力：解析 → 匹配 → 生成 → 通知。</p>
        </div>
        <el-button text @click="app.openAiDialog()">
          用 AI 描述需求
          <el-icon class="ml-1"><ArrowRight /></el-icon>
        </el-button>
      </div>
      <div class="grid g4">
        <SceneTile
          v-for="meta in sceneList"
          :key="meta.key"
          :scene="meta.key"
          :stat="sceneStats[meta.key]"
          @click="router.push(meta.route)"
        />
      </div>
    </section>

    <!-- ============ 待办 + 通知 ============ -->
    <div class="grid g-7-5 mt-5">
      <SectionCard title="我的待办与进度" desc="申请进度、论坛待回复都在这里收口">
        <template #actions>
          <el-button v-if="user.canAccess('classroom')" text size="small" @click="router.push('/classroom/status')">全部申请</el-button>
        </template>
        <div class="todo-list">
          <button v-for="item in todos" :key="item.id" type="button" class="todo" @click="router.push(item.to)">
            <span class="todo__icon" :class="`todo__icon--${item.tone}`">
              <el-icon :size="15"><component :is="item.type === '论坛待回复' ? ChatDotRound : Calendar" /></el-icon>
            </span>
            <span class="todo__main">
              <span class="todo__title">{{ item.title }}</span>
              <span class="todo__desc">{{ item.desc }}</span>
            </span>
            <StatusPill :status="item.status" />
            <el-icon class="todo__arrow" :size="13"><ArrowRight /></el-icon>
          </button>
          <div v-if="!todos.length" class="todo-empty">所有事情都安排好了，今天没有待办。</div>
        </div>
        <div class="todo-foot">
          <span class="muted t-xs">平均处理时长 <b class="strong">1.4 小时</b> · 采纳率 <b class="strong">86%</b></span>
          <el-button v-if="user.canAccess('classroom')" text size="small" @click="router.push('/classroom')">去借教室</el-button>
        </div>
      </SectionCard>

      <SectionCard title="最新通知" desc="重要消息红色高亮">
        <template #actions>
          <el-button text size="small" @click="router.push('/notifications')">消息中心</el-button>
        </template>
        <div class="notice-list">
          <button
            v-for="item in notices"
            :key="item.id"
            type="button"
            class="notice-row"
            :class="{ 'is-unread': !item.read, 'is-important': item.important }"
            @click="openNotice(item)"
          >
            <span class="notice-row__dot" :class="{ 'is-important': item.important }"></span>
            <span class="notice-row__main">
              <span class="notice-row__title">{{ item.title }}</span>
              <span class="notice-row__desc">{{ item.content }}</span>
              <span class="notice-row__time">{{ timeAgo(item.time) }}</span>
            </span>
          </button>
        </div>
      </SectionCard>
    </div>

    <!-- ============ 拼单 + 失物匹配 ============ -->
    <div class="grid g-7-5 mt-5">
      <SectionCard title="进行中的拼单" desc="AI 会在成团 / 截止前自动提醒">
        <template #actions>
          <el-button text size="small" @click="router.push('/groupbuy')">进入集市</el-button>
        </template>
        <div class="buy-list">
          <button
            v-for="item in ongoingList"
            :key="item.id"
            type="button"
            class="buy"
            :class="`buy--${item.tone || 'brand'}`"
            @click="router.push(`/groupbuy/${item.id}`)"
          >
            <span class="buy__art">{{ item.product?.slice(0, 1) }}</span>
            <span class="buy__main">
              <span class="buy__title">{{ item.title }}</span>
              <span class="buy__meta">
                ¥{{ item.unitPrice }} / 份 · {{ groupbuy.joinedCountOf(item) }}/{{ item.targetCount }} 份
                · <CountdownText :target="item.deadline" compact />
              </span>
              <span class="buy__bar"><i :style="{ width: `${groupbuy.progressOf(item)}%` }"></i></span>
            </span>
            <ProgressRing :value="groupbuy.progressOf(item)" :size="46" :stroke="5" :tone="item.tone || 'brand'" />
          </button>
        </div>
      </SectionCard>

      <SectionCard title="AI 匹配线索" desc="失物与招领的双向特征比对">
        <template #actions>
          <AiBadge small />
        </template>
        <div v-if="pairs.length" class="pair-list">
          <div v-for="pair in pairs" :key="`${pair.lost.id}_${pair.found.id}`" class="pair">
            <div class="pair__score">
              <b>{{ pair.score }}</b>
              <span>%</span>
            </div>
            <div class="pair__main">
              <div class="pair__line"><StatusPill status="open" text="寻物" /> {{ pair.lost.title }}</div>
              <div class="pair__line"><StatusPill status="done" text="招领" /> {{ pair.found.title }}</div>
              <div class="pair__reasons">{{ pair.reasons.slice(0, 2).join(' · ') }}</div>
            </div>
          </div>
        </div>
        <div v-else class="pair-empty">暂无线索，发布信息后 AI 会持续匹配。</div>
        <el-button class="pair-cta" text size="small" @click="router.push('/lostfound')">
          去失物招领广场
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </SectionCard>
    </div>

    <!-- ============ 调度流水 ============ -->
    <section class="page-section">
      <div class="grid g-7-5">
        <SectionCard title="最近调度记录" desc="每一次 AI 介入都会留下可追溯的匹配记录">
          <template #actions>
            <el-button text size="small" @click="router.push('/ai-record')">AI 使用记录</el-button>
          </template>
          <div class="record-list">
            <div v-for="record in records" :key="record.id" class="record">
              <SceneIcon :scene="record.scene" :size="34" />
              <div class="record__main">
                <div class="record__raw">“{{ record.raw }}”</div>
                <div class="record__summary">{{ record.summary }}</div>
              </div>
              <div class="record__right">
                <span class="record__conf">{{ Math.round(record.confidence * 100) }}%</span>
                <span class="record__time">{{ timeAgo(record.createdAt) }}</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="为什么选择「校园智能调度平台」" desc="不是又一个办事入口，而是一层 AI 调度能力">
          <div class="why">
            <div class="why__item">
              <span class="why__num">01</span>
              <div>
                <b>一句话，而不是一张表</b>
                <p>把申请表单压缩成一句自然语言，AI 负责补全字段，用户只需确认。</p>
              </div>
            </div>
            <div class="why__item">
              <span class="why__num">02</span>
              <div>
                <b>给理由，而不是给链接</b>
                <p>推荐教室时说明容量、设备、距离与空闲时段，让采纳有依据。</p>
              </div>
            </div>
            <div class="why__item">
              <span class="why__num">03</span>
              <div>
                <b>可校正，而不是黑盒</b>
                <p>低置信度强制人工确认；所有 AI 生成内容带标识，结果可编辑。</p>
              </div>
            </div>
          </div>
          <div class="why__cta">
            <el-icon :size="14"><TrendCharts /></el-icon>
            两轮迭代后，解析准确率从 68% → 91%
          </div>
        </SectionCard>
      </div>
    </section>

    <footer class="home-foot">
      <span>校园智能调度平台</span>
      <span class="home-foot__meta">{{ CAMPUS.school }}{{ CAMPUS.campus }} · {{ CAMPUS.address }} · {{ CAMPUS.phone }}</span>
      <span class="home-foot__meta">AI 应用创意大赛 · 演示数据均为模拟生成</span>
    </footer>
  </div>
</template>

<style scoped>
.home {
  max-width: var(--content-max);
  margin: 0 auto;
}

/* ---------- Hero：左重右轻的编辑式版面 ---------- */
.hero {
  position: relative;
  padding-top: 8px;
  border-bottom: 1px solid var(--line);
}

.hero__body {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(280px, 1fr);
  gap: clamp(32px, 5vw, 64px);
  padding: 24px 0 32px;
}

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.hero__eyebrow .dot {
  background: var(--brand-500);
}

.hero__title {
  margin: 24px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(30px, 3.4vw, 40px);
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--text-1);
}

.hero__title-soft {
  display: block;
  margin-top: 8px;
  color: var(--text-3);
  font-weight: 400;
}

.hero__desc {
  margin: 16px 0 0;
  max-width: 52ch;
  font-size: var(--fs-base);
  line-height: 1.75;
  color: var(--text-2);
}

.hero__hl {
  color: var(--text-1);
  font-weight: 500;
  border-bottom: 1px solid var(--line-strong);
  padding-bottom: 0px;
}

.hero__input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 32px;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  transition:
    border-color var(--dur-fast),
    box-shadow var(--dur-fast);
}

.hero__input.is-focus,
.hero__input:focus-within {
  border-color: var(--brand-500);
  box-shadow: 0 0 0 3px var(--brand-50);
}

.hero__input-orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--brand-600);
  color: var(--text-invert);
  flex: none;
}

.hero__input-field {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-family: inherit;
  font-size: var(--fs-base);
  color: var(--text-1);
  padding: 4px 0;
}

.hero__input-field::placeholder {
  color: var(--text-4);
}

.hero__input-kbd {
  padding: 0px 4px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
  flex: none;
}

.hero__submit {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--brand-600);
  color: var(--text-invert);
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  flex: none;
  transition: background var(--dur-fast) var(--ease-out);
}

.hero__submit:hover {
  background: var(--brand-700);
}

.hero__chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.hero__chips-label {
  font-size: var(--fs-xs);
  color: var(--text-4);
}

.hero__chip {
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: var(--fs-xs);
  cursor: pointer;
  transition:
    background var(--dur-fast),
    border-color var(--dur-fast),
    color var(--dur-fast);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero__chip:hover {
  background: var(--surface-3);
  color: var(--text-1);
  border-color: var(--line-strong);
}

.hero__side {
  display: flex;
  align-items: stretch;
}

.hero__side-card {
  width: 100%;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  align-self: center;
}

.hero__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.hero__side-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-1);
}

.hero__side-live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.hero__side-live i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--teal-500);
}

.hero__pipe {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.hero__pipe-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-radius: 0;
  border-bottom: 1px solid var(--line);
}

.hero__pipe-item:last-child {
  border-bottom: none;
}

.hero__pipe-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--brand-600);
  flex: none;
}

.hero__pipe-meta {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}

.hero__pipe-title {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text-1);
}

.hero__pipe-desc {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.hero__pipe-index {
  font-family: var(--font-serif);
  font-size: var(--fs-xs);
  color: var(--text-4);
}

.hero__side-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.hero__side-foot b {
  color: var(--text-1);
  font-weight: 600;
}

.hero__metrics {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--line-strong);
  background: transparent;
}

.hero__metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 16px 24px;
  border-right: 1px solid var(--line);
}

.hero__metric:first-child {
  padding-left: 0;
}

.hero__metric:last-child {
  border-right: none;
}

.hero__metric-label {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.hero__metric-value {
  font-family: var(--font-serif);
  font-size: var(--fs-2xl);
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.hero__metric-value span {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  margin-left: 0px;
  color: var(--text-3);
}

.hero__metric-delta {
  font-size: var(--fs-xs);
  color: var(--text-4);
}

.hero__metric--cta {
  cursor: pointer;
  transition: background var(--dur-fast);
}

.hero__metric--cta:hover {
  background: var(--surface-2);
}

.hero__metric-link {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--brand-600);
}

/* ---------- 待办 ---------- */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.todo {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  border-radius: 0;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--dur);
}

.todo:hover {
  background: var(--surface-2);
}

.todo__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  flex: none;
}

.todo__icon--brand {
  background: var(--brand-50);
  color: var(--brand-600);
}

.todo__icon--coral {
  background: var(--coral-50);
  color: var(--coral-600);
}

.todo__main {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}

.todo__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo__desc {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo__arrow {
  color: var(--text-4);
  flex: none;
}

.todo-empty {
  padding: 24px 0;
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.todo-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
}

/* ---------- 通知 ---------- */
.notice-list {
  display: flex;
  flex-direction: column;
}

.notice-row {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  border-radius: 0;
  transition: background var(--dur);
}

.notice-row:hover {
  background: var(--surface-2);
}

.notice-row__dot {
  width: 6px;
  height: 6px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--line-strong);
  flex: none;
}

.notice-row__dot.is-important {
  background: var(--coral-500);
  box-shadow: none;
}

.notice-row__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.notice-row__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  line-height: 1.5;
}

.notice-row.is-unread .notice-row__title {
  font-weight: 600;
  color: var(--text-1);
}

.notice-row.is-important .notice-row__title {
  color: var(--coral-600);
}

.notice-row__desc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notice-row__time {
  font-size: 12px;
  color: var(--text-4);
}

/* ---------- 拼单 ---------- */
.buy-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.buy {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--dur) var(--ease-out);
}

.buy:last-child {
  border-bottom: none;
}

.buy:hover {
  background: var(--surface-2);
}

.buy__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 18px;
  font-weight: 700;
  flex: none;
}

.buy--teal .buy__art {
  background: var(--teal-50);
  color: var(--teal-600);
}

.buy--amber .buy__art {
  background: var(--amber-50);
  color: var(--amber-600);
}

.buy--coral .buy__art {
  background: var(--coral-50);
  color: var(--coral-600);
}

.buy__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.buy__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.buy__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-3);
}

.buy__bar {
  display: block;
  height: 4px;
  border-radius: 4px;
  background: var(--surface-3);
  overflow: hidden;
}

.buy__bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--brand-500);
}

.buy--teal .buy__bar i {
  background: var(--teal-500);
}

.buy--amber .buy__bar i {
  background: var(--amber-500);
}

.buy--coral .buy__bar i {
  background: var(--coral-500);
}

/* ---------- 匹配 ---------- */
.pair-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pair {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 0;
  background: var(--surface-2);
  border: none;
  border-left: 2px solid var(--brand-400);
}

.pair__score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  flex: none;
  line-height: 1;
}

.pair__score b {
  font-size: 18px;
  font-weight: 700;
  color: var(--brand-600);
  letter-spacing: 0;
}

.pair__score span {
  font-size: 12px;
  color: var(--brand-400);
}

.pair__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pair__line {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pair__reasons {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pair-empty {
  padding: 24px 0;
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.pair-cta {
  margin-top: 8px;
}

/* ---------- 调度记录 ---------- */
.record-list {
  display: flex;
  flex-direction: column;
}

.record {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.record:last-child {
  border-bottom: none;
}

.record__main {
  flex: 1;
  min-width: 0;
}

.record__raw {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record__summary {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
}

.record__conf {
  padding: 0px 4px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}

.record__time {
  font-size: 12px;
  color: var(--text-4);
}

/* ---------- Why ---------- */
.why {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.why__item {
  display: flex;
  gap: 12px;
}

.why__num {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-400);
  padding-top: 0px;
  flex: none;
}

.why__item b {
  display: block;
  font-size: 13px;
  color: var(--text-1);
}

.why__item p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.why__cta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  background: var(--teal-50);
  color: var(--teal-700);
  font-size: 12px;
  font-weight: 600;
}

/* ---------- Footer ---------- */
.home-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-4);
}

.home-foot__meta {
  letter-spacing: 0.02em;
}

@media (max-width: 1180px) {
  .hero__body {
    grid-template-columns: 1fr;
  }

  .hero__side {
    display: none;
  }

  .hero__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero__metric:nth-child(2) {
    border-right: none;
  }

  /* 两列时按列重设内边距：每行首格贴齐内容左缘，第二列保留缩进 */
  .hero__metric:nth-child(odd) {
    padding-left: 0;
  }

  .hero__metric:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }
}

@media (max-width: 900px) {
  .hero__input-kbd {
    display: none;
  }

  .hero__chips {
    display: none;
  }
}

@media (max-width: 640px) {
  .home__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home__kpis .stat__value {
    font-size: var(--fs-2xl);
  }

  .hero__body {
    padding: 16px 0 24px;
  }

  .hero__title {
    font-size: var(--fs-3xl);
  }

  .hero__desc {
    font-size: var(--fs-sm);
  }

  .hero__input {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
  }

  .hero__input-field {
    flex: 1 1 60%;
    min-width: 0;
    padding: 4px 0px;
    font-size: 13px;
  }

  .hero__input-kbd {
    display: none;
  }

  .hero__submit {
    flex: 1 1 100%;
    justify-content: center;
    margin-top: 0px;
    height: 38px;
    padding: 0 12px;
  }

  .hero__metric {
    padding: 16px;
  }

  .hero__metric-value {
    font-size: var(--fs-xl);
  }

  .todo-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
