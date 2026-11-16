<script setup>
import { computed } from 'vue'
import { ArrowRight, Clock, Location, StarFilled } from '@element-plus/icons-vue'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN } from '@/utils/format'
import { roomFreeAt } from '@/utils/aiEngine'

const props = defineProps({
  room: { type: Object, required: true },
  day: { type: Number, default: 3 },
})

defineEmits(['open'])

const classroom = useClassroomStore()

const toneClass = computed(() => `media-cover--${props.room.tone || 'brand'}`)
const dayLabel = computed(() => WEEK_CN[Number(props.day) % 7])
const dayBusy = computed(() =>
  (props.room.busy || []).filter((b) => Number(b.day) === Number(props.day)),
)
const freeSlots = computed(() => classroom.freeSlotsOf(props.room, props.day))
const freeState = computed(() => {
  if (!dayBusy.value.length) return { text: '今日全天空闲', ok: true }
  if (!freeSlots.value.length) return { text: '今日已排满', ok: false }
  return { text: `今日 ${freeSlots.value.length} 段空闲`, ok: true }
})
const slotStates = computed(() =>
  classroom.filters.slots.map((slot) => ({
    ...slot,
    busy: !roomFreeAt(props.room, props.day, slot.start, slot.end),
  })),
)
</script>

<template>
  <article
    class="room-card card"
    role="button"
    tabindex="0"
    :aria-label="`查看 ${room.building} ${room.code} 的课表与空闲时段`"
    @click="$emit('open', room)"
    @keydown.enter="$emit('open', room)"
    @keydown.space.prevent="$emit('open', room)"
  >
    <div class="room-card__art media-cover" :class="toneClass">
      <span class="room-card__campus">{{ room.campus }} · {{ room.kind }}</span>
      <span class="room-card__rating">
        <el-icon :size="11"><StarFilled /></el-icon>
        {{ room.rating }}
      </span>
      <div class="room-card__art-main">
        <span class="room-card__code">{{ room.code }}</span>
        <span class="room-card__place">
          {{ room.building }} · {{ room.floor }} 层 ·
          {{ room.capacity ? `${room.capacity} 座` : '容量待核' }}
        </span>
      </div>
      <span class="room-card__watermark" aria-hidden="true">{{ room.capacity || '待核' }}</span>
    </div>

    <div class="room-card__body">
      <div class="room-card__topline">
        <span class="room-card__state" :class="{ 'is-full': !freeState.ok }">
          <span class="room-card__dot" aria-hidden="true"></span>
          {{ freeState.text }}
        </span>
        <span class="room-card__distance">
          <el-icon :size="12"><Location /></el-icon>
          {{ room.distance }}m
        </span>
      </div>

      <div class="room-card__slots" aria-hidden="true">
        <span
          v-for="(slot, index) in slotStates"
          :key="index"
          class="room-card__slot"
          :class="{ 'is-busy': slot.busy }"
          :title="`${slot.label} · ${slot.busy ? '已占用' : '空闲'}`"
        ></span>
      </div>
      <div class="room-card__slots-label">
        <span>{{ dayLabel }}课表</span>
        <span class="faint">6 个时段</span>
      </div>

      <div v-if="room.className" class="room-card__class" :title="room.className">
        <span class="room-card__class-label">班级</span>
        <span class="truncate">{{ room.className }}</span>
      </div>

      <div class="tag-row">
        <span v-for="item in room.equipment.slice(0, 3)" :key="item" class="tag-soft tag-soft--brand">
          {{ item }}
        </span>
        <span v-if="room.equipment.length > 3" class="tag-soft">+{{ room.equipment.length - 3 }}</span>
      </div>

      <div class="room-card__foot">
        <span>
          <el-icon :size="12"><Clock /></el-icon>
          {{ freeSlots.length }} 段可借
        </span>
        <span class="room-card__link">
          查看课表
          <el-icon :size="12"><ArrowRight /></el-icon>
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.room-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.24s var(--ease-out),
    box-shadow 0.24s var(--ease-out),
    border-color 0.24s var(--ease-out);
}

.room-card:hover {
  transform: translateY(-3px);
  border-color: var(--brand-200);
  box-shadow: var(--shadow-md);
}

.room-card:focus-visible {
  outline: 2px solid var(--brand-300);
  outline-offset: 2px;
}

.room-card__art {
  position: relative;
  display: block;
  height: 124px;
  padding: 14px;
  border-radius: 0;
  flex: none;
}

.room-card__campus {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.62);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.room-card__rating {
  position: absolute;
  z-index: 1;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 21px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.62);
  font-size: 11px;
  font-weight: 750;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.room-card__art-main {
  position: absolute;
  z-index: 1;
  left: 14px;
  right: 74px;
  bottom: 13px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.room-card__code {
  font-size: 23px;
  font-weight: 760;
  line-height: 1.12;
  letter-spacing: -0.035em;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-card__place {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 560;
  color: var(--text-2);
  opacity: 0.82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-card__watermark {
  position: absolute;
  right: 2px;
  bottom: -16px;
  font-size: 68px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.07em;
  color: rgba(17, 21, 39, 0.07);
  pointer-events: none;
}

.room-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  padding: 13px 16px 14px;
}

.room-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.room-card__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--teal-600);
}

.room-card__state.is-full {
  color: var(--amber-600);
}

.room-card__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(18, 179, 166, 0.14);
  flex: none;
}

.room-card__state.is-full .room-card__dot {
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.16);
}

.room-card__distance {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}

.room-card__slots {
  display: flex;
  gap: 4px;
}

.room-card__slot {
  flex: 1;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--teal-100);
}

.room-card__slot.is-busy {
  background: var(--line-strong);
}

.room-card__slots-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -5px;
  font-size: 11px;
  color: var(--text-3);
}

.room-card__class {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 2px 0 8px;
  font-size: 11.5px;
  color: var(--text-3);
}

.room-card__class-label {
  flex: none;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 10.5px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.room-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 9px;
  border-top: 1px dashed var(--line);
  font-size: 11.5px;
  color: var(--text-3);
}

.room-card__foot > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.room-card__link {
  color: var(--brand-600);
  font-weight: 650;
}
</style>
