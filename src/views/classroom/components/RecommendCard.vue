<script setup>
import { computed } from 'vue'
import {
  CircleCheck,
  Clock,
  MagicStick,
  School,
  StarFilled,
  Warning,
} from '@element-plus/icons-vue'
import ProgressRing from '@/components/ProgressRing.vue'
import AiBadge from '@/components/AiBadge.vue'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN } from '@/utils/format'

const props = defineProps({
  item: { type: Object, required: true },
  rank: { type: Number, default: 1 },
  criteria: { type: Object, default: () => ({ day: 3, start: '15:00', end: '17:00' }) },
})

defineEmits(['apply', 'detail'])

const classroom = useClassroomStore()

const room = computed(() => props.item.room)
const toneClass = computed(() => `media-cover--${room.value.tone || 'brand'}`)
const ringTone = computed(() => {
  const tone = room.value.tone
  return ['brand', 'teal', 'amber', 'coral'].includes(tone) ? tone : 'brand'
})
const dayLabel = computed(() => WEEK_CN[Number(props.criteria.day) % 7])
const freeSlots = computed(() => classroom.freeSlotsOf(room.value, Number(props.criteria.day) || 3))
</script>

<template>
  <article class="rec-card card" :class="{ 'is-first': rank === 1 }">
    <div class="rec-card__top">
      <span class="rec-card__rank" :class="{ 'is-first': rank === 1 }">
        {{ rank === 1 ? 'AI 首选' : `TOP ${rank}` }}
      </span>
      <span class="rec-card__rating">
        <el-icon :size="11"><StarFilled /></el-icon>
        {{ room.rating }} 分
      </span>
    </div>

    <div class="rec-card__head">
      <div class="rec-card__art media-cover" :class="toneClass">
        <el-icon :size="21"><School /></el-icon>
        <span class="rec-card__floor">{{ room.floor }}F</span>
      </div>
      <div class="rec-card__head-text">
        <h3 class="rec-card__title">{{ ['会议室', '报告厅'].includes(room.kind) ? room.code : `${room.building} ${room.code}` }}</h3>
        <p class="rec-card__sub">{{ room.campus }} · {{ room.kind }} · {{ room.floor }} 层 · 距你 {{ room.distance }}m</p>
      </div>
      <ProgressRing :value="item.matchScore" :size="58" :stroke="5" :tone="ringTone" caption="匹配度" />
    </div>

    <div class="rec-card__stats">
      <div>
        <strong v-if="room.capacity">{{ room.capacity }}</strong>
        <strong v-else class="rec-card__pending">待核</strong>
        <span>容量 / 人</span>
      </div>
      <div>
        <strong>{{ room.distance }}<small>m</small></strong>
        <span>步行距离</span>
      </div>
      <div>
        <strong>{{ room.equipment.length }}</strong>
        <span>项设备</span>
      </div>
    </div>

    <div class="tag-row">
      <span v-for="item2 in room.equipment" :key="item2" class="tag-soft">{{ item2 }}</span>
    </div>

    <div class="rec-card__block">
      <div class="rec-card__label">
        <el-icon :size="12"><Clock /></el-icon>
        {{ dayLabel }}空闲时段
      </div>
      <div class="tag-row">
        <span class="tag-soft tag-soft--teal">
          <el-icon :size="11"><CircleCheck /></el-icon>
          {{ criteria.start }}–{{ criteria.end }} 匹配
        </span>
        <span v-for="slot in freeSlots.slice(0, 3)" :key="slot.start" class="tag-soft">
          {{ slot.start }}–{{ slot.end }}
        </span>
      </div>
      <p v-if="!freeSlots.length" class="faint t-xs mt-2">当天已无空闲时段</p>
    </div>

    <div class="rec-card__reasons">
      <div class="rec-card__label-row">
        <span class="rec-card__label">
          <el-icon :size="12"><MagicStick /></el-icon>
          AI 推荐理由
        </span>
        <AiBadge ghost small />
      </div>
      <ul class="rec-card__reason-list">
        <li v-for="(reason, index) in item.reasons" :key="index">
          <el-icon :size="12"><CircleCheck /></el-icon>
          <span>{{ reason }}</span>
        </li>
      </ul>
    </div>

    <div v-if="item.matchScore < 72" class="rec-card__warning">
      <el-icon :size="12"><Warning /></el-icon>
      <span>匹配度偏低，建议先核对课表或联系管理员人工确认，再提交申请。</span>
    </div>

    <div class="rec-card__actions">
      <el-button type="primary" class="grow" @click="$emit('apply', room)">一键申请</el-button>
      <el-button @click="$emit('detail', room)">查看详情</el-button>
    </div>
  </article>
</template>

<style scoped>
.rec-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  overflow: hidden;
  transition:
    transform 0.24s var(--ease-out),
    box-shadow 0.24s var(--ease-out),
    border-color 0.24s var(--ease-out);
}

.rec-card:hover {
  transform: translateY(-3px);
  border-color: var(--brand-200);
  box-shadow: var(--shadow-md);
}

.rec-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #6c63ff, #12b3a6 70%, #f5a623);
  opacity: 0;
}

.rec-card.is-first::before {
  opacity: 1;
}

.rec-card.is-first {
  border-color: var(--brand-200);
  box-shadow:
    0 22px 44px -34px rgba(108, 99, 255, 0.6),
    var(--shadow-sm);
}

.rec-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rec-card__rank {
  display: inline-flex;
  align-items: center;
  height: 23px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.rec-card__rank.is-first {
  background: linear-gradient(120deg, rgba(108, 99, 255, 0.14), rgba(18, 179, 166, 0.16));
  color: var(--brand-700);
  border: 1px solid var(--brand-100);
}

.rec-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 650;
  color: var(--amber-600);
  font-variant-numeric: tabular-nums;
}

.rec-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rec-card__art {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 14px;
}

.rec-card__floor {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.rec-card__head-text {
  flex: 1;
  min-width: 0;
}

.rec-card__title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 720;
  letter-spacing: -0.025em;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-card__sub {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 0;
  border-top: 1px dashed var(--line);
  border-bottom: 1px dashed var(--line);
}

.rec-card__stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}

.rec-card__stats > div:first-child {
  padding-left: 0;
  border-left: none;
}

.rec-card__stats strong {
  font-size: var(--fs-lg);
  font-weight: 740;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.rec-card__stats strong small {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  margin-left: 1px;
}

.rec-card__stats span {
  font-size: 10px;
  color: var(--text-3);
}

.rec-card__pending {
  font-size: 14px !important;
  color: var(--amber-600) !important;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rec-card__block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.rec-card__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.rec-card__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rec-card__reasons {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
}

.rec-card__reason-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rec-card__reason-list li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
}

.rec-card__reason-list li .el-icon {
  margin-top: 2px;
  color: var(--teal-500);
  flex: none;
}

.rec-card__warning {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--amber-100);
  border-radius: 9px;
  background: var(--amber-50);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--amber-600);
}

.rec-card__warning .el-icon {
  flex: none;
  margin-top: 1px;
}

.rec-card__actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 2px;
}

@media (max-width: 640px) {
  .rec-card {
    padding: 15px;
  }

  .rec-card__title {
    font-size: var(--fs-md);
  }
}
</style>
