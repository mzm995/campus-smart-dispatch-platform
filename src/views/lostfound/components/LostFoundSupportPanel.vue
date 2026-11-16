<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BellFilled,
  ChatDotRound,
  InfoFilled,
  QuestionFilled,
  Trophy,
} from '@element-plus/icons-vue'
import SectionCard from '@/components/SectionCard.vue'

defineProps({
  pendingClaimCount: { type: Number, default: 0 },
  rewardPostCount: { type: Number, default: 0 },
  resolvedCount: { type: Number, default: 0 },
  resolvedCases: { type: Array, default: () => [] },
  usingFallbackCases: { type: Boolean, default: true },
})

const router = useRouter()
const activeFaq = ref('faq-reward')

const PROCESS_STEPS = [
  {
    title: '发布寻物或招领',
    desc: '写清物品、颜色、地点、时间和独特特征。',
    tip: '寻物可设置打赏，招领无需设置。',
  },
  {
    title: 'AI 双向匹配',
    desc: '系统按物品、颜色、地点和时间窗口比对。',
    tip: '相似度结果仅作为线索参考。',
  },
  {
    title: '提交线索或认领',
    desc: '失主从招领帖认领，帮助者也可提交归还说明。',
    tip: '认领必须关联本人未完成的寻物信息。',
  },
  {
    title: '核验领取与打赏',
    desc: '招领人核验后，由失主确认领取并处理悬赏。',
    tip: '未设置打赏时，双方自行联系完成领取。',
  },
]

const FAQ_ITEMS = [
  {
    id: 'faq-reward',
    question: '寻物打赏什么时候结算？',
    answer: '招领发布者核验归属、失主确认领取后记录打赏；本演示环境只保存结算状态，不发起真实支付。',
  },
  {
    id: 'faq-no-reward',
    question: '没有设置打赏，如何领取物品？',
    answer: '发布者会看到帮助者留下的联系说明。双方先核对物品特征，再自行约定校内地点领取，最后点击“确认自行领取”。',
  },
  {
    id: 'faq-first-lost',
    question: '为什么认领招领物品前要先发布寻物？',
    answer: '寻物信息提供归属依据、失物特征和是否存在悬赏。认领申请会关联这条记录，避免冒领和状态错乱。',
  },
  {
    id: 'faq-privacy',
    question: '联系方式会公开显示吗？',
    answer: '广场只展示脱敏联系人。详细联系说明只会展示给发布者或对应线索提交者。',
  },
]
</script>

<template>
  <SectionCard title="找回与认领流程" desc="先发布，再匹配，最后核验领取，状态始终可追踪">
    <template #actions>
      <span class="tag-soft tag-soft--teal">4 步完成</span>
    </template>

    <div class="process-stats">
      <div>
        <strong class="mono">{{ pendingClaimCount }}</strong>
        <span>待处理认领</span>
      </div>
      <div>
        <strong class="mono">{{ rewardPostCount }}</strong>
        <span>悬赏寻物</span>
      </div>
      <div>
        <strong class="mono">{{ resolvedCount }}</strong>
        <span>已找回</span>
      </div>
    </div>

    <ol class="process-list">
      <li v-for="(step, index) in PROCESS_STEPS" :key="step.title" class="process-step">
        <span class="process-step__num mono">{{ String(index + 1).padStart(2, '0') }}</span>
        <div>
          <strong>{{ step.title }}</strong>
          <p>{{ step.desc }}</p>
          <span>{{ step.tip }}</span>
        </div>
      </li>
    </ol>
  </SectionCard>

  <slot name="publish" />

  <SectionCard title="最近找回故事" desc="真实流程中的核验、领取与打赏记录">
    <template #actions>
      <span class="tag-soft tag-soft--amber">
        <el-icon><Trophy /></el-icon>
        {{ usingFallbackCases ? '演示案例' : '最近完成' }}
      </span>
    </template>

    <div class="case-list">
      <article v-for="item in resolvedCases" :key="item.id" class="case-item">
        <span class="case-item__icon" :class="`is-${item.tone}`">{{ item.icon }}</span>
        <div class="case-item__main">
          <div class="case-item__head">
            <strong>{{ item.title }}</strong>
            <span v-if="item.reward > 0" class="case-item__reward">
              ¥{{ Number(item.reward).toFixed(2) }}
            </span>
          </div>
          <span class="case-item__meta">{{ item.meta }}</span>
          <p>“{{ item.quote }}”</p>
        </div>
      </article>
    </div>
    <el-button class="case-foot" text size="small" @click="router.push('/forum')">
      去论坛分享找回经验
      <el-icon><ArrowRight /></el-icon>
    </el-button>
  </SectionCard>

  <slot name="tips" />

  <SectionCard title="常见问题" desc="关于认领、打赏和隐私的高频问题">
    <template #actions>
      <span class="tag-soft">
        <el-icon><QuestionFilled /></el-icon>
        FAQ
      </span>
    </template>
    <el-collapse v-model="activeFaq" accordion class="lf-faq">
      <el-collapse-item
        v-for="item in FAQ_ITEMS"
        :key="item.id"
        :name="item.id"
      >
        <template #title>
          <span class="lf-faq__question">{{ item.question }}</span>
        </template>
        <p class="lf-faq__answer">{{ item.answer }}</p>
      </el-collapse-item>
    </el-collapse>
    <div class="faq-notice">
      <el-icon><BellFilled /></el-icon>
      <div>
        <strong>认领提醒</strong>
        <span>提交认领后请留意消息通知；招领人通过后，需由失主本人确认领取。</span>
      </div>
    </div>
    <div class="faq-contact">
      <el-icon><ChatDotRound /></el-icon>
      <span>仍有疑问？可到校园论坛“求助问答”板块发起咨询。</span>
    </div>
  </SectionCard>

  <section class="card announce-card">
    <div class="announce-card__head">
      <span class="announce-card__icon"><el-icon><BellFilled /></el-icon></span>
      <div>
        <span>校园公告</span>
        <strong>认领核验与线下交接提醒</strong>
      </div>
    </div>
    <ul>
      <li><i>01</i><span>认领招领物品前，请先发布对应寻物信息并填写可核验特征。</span></li>
      <li><i>02</i><span>请在食堂、宿舍楼下等校内公共区域交接，不提前支付不明费用。</span></li>
      <li><i>03</i><span>悬赏仅用于记录校园互助打赏状态，异常情况请联系辅导员。</span></li>
    </ul>
    <div class="announce-card__foot">
      <el-icon><InfoFilled /></el-icon>
      <span>校园公益互助 · 真实联系方式不公开显示</span>
    </div>
  </section>
</template>

<style scoped>
.process-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 14px;
}

.process-stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.process-stats strong {
  font-size: 17px;
  color: var(--text-1);
}

.process-stats span {
  font-size: 9px;
  color: var(--text-3);
}

.process-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.process-list::before {
  content: "";
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 14px;
  width: 1px;
  background: linear-gradient(var(--brand-200), var(--teal-100));
}

.process-step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.process-step__num {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 29px;
  height: 29px;
  flex: none;
  border: 4px solid var(--surface);
  border-radius: 50%;
  color: var(--brand-600);
  background: var(--brand-100);
  font-size: 8px;
  font-weight: 750;
  box-shadow: 0 0 0 1px var(--line);
}

.process-step > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 1px;
}

.process-step strong {
  font-size: 11.5px;
  color: var(--text-1);
}

.process-step p {
  margin: 0;
  font-size: 10px;
  line-height: 1.55;
  color: var(--text-3);
}

.process-step > div > span {
  margin-top: 2px;
  font-size: 9px;
  line-height: 1.45;
  color: var(--brand-600);
}

.case-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.case-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-2);
}

.case-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 13px;
  font-weight: 750;
}

.case-item__icon.is-teal {
  color: var(--teal-700);
  background: var(--teal-50);
}

.case-item__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.case-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.case-item__head strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
}

.case-item__reward {
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--amber-700);
  background: var(--amber-50);
  font-size: 8.5px;
  font-weight: 700;
}

.case-item__meta {
  font-size: 9px;
  color: var(--text-4);
}

.case-item__main p {
  margin: 3px 0 0;
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.case-foot {
  width: 100%;
  margin-top: 9px;
  margin-left: 0;
}

.lf-faq {
  border-top: 1px solid var(--line);
  border-bottom: 0;
}

.lf-faq :deep(.el-collapse-item__header) {
  min-height: 42px;
  height: auto;
  padding: 9px 0;
  line-height: 1.45;
  background: transparent;
}

.lf-faq :deep(.el-collapse-item__wrap) {
  background: transparent;
}

.lf-faq__question {
  padding-right: 8px;
  font-size: 11px;
  font-weight: 620;
  color: var(--text-2);
}

.lf-faq__answer {
  margin: 0;
  padding: 0 12px 10px 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--text-3);
}

.faq-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid rgba(245, 166, 35, 0.2);
  border-radius: 10px;
  color: var(--amber-600);
  background: rgba(245, 166, 35, 0.06);
}

.faq-notice > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.faq-notice strong {
  font-size: 10px;
  color: var(--text-1);
}

.faq-notice span {
  font-size: 9px;
  line-height: 1.55;
  color: var(--text-3);
}

.faq-contact {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  font-size: 9.5px;
  color: var(--text-3);
}

.announce-card {
  padding: 17px 18px;
  background:
    radial-gradient(180px 100px at 100% 0, rgba(108, 99, 255, 0.09), transparent 70%),
    var(--surface);
}

.announce-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.announce-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  color: var(--brand-600);
  background: var(--brand-50);
  font-size: 15px;
}

.announce-card__head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.announce-card__head span {
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  color: var(--brand-600);
}

.announce-card__head strong {
  font-size: 11.5px;
  color: var(--text-1);
}

.announce-card ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 13px 0 0;
  padding: 0;
  list-style: none;
}

.announce-card li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.announce-card li i {
  flex: none;
  color: var(--brand-500);
  font-family: var(--font-mono);
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
}

.announce-card__foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 9px;
  color: var(--text-4);
}
</style>
