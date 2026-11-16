<script setup>
import { computed } from 'vue'
import { ArrowRight, Clock, Location, StarFilled } from '@element-plus/icons-vue'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN } from '@/utils/format'

const props = defineProps({
  room: { type: Object, required: true },
  day: { type: Number, default: 3 },
  date: { type: String, default: '' },
})

defineEmits(['open'])

const classroom = useClassroomStore()

const toneClass = computed(() => `media-cover--${props.room.tone || 'brand'}`)
const dayLabel = computed(() => WEEK_CN[Number(props.day) % 7])
const freeSlots = computed(() => classroom.freeSlotsOf(props.room, props.day, props.date))
const slotStates = computed(() =>
  classroom.filters.slots.map((slot) => ({
    ...slot,
    busy: !classroom.roomFreeAt(props.room, props.day, slot.start, slot.end, props.date),
  })),
)
const freeState = computed(() => {
  const busyCount = slotStates.value.filter((slot) => slot.busy).length
  if (!busyCount && !freeSlots.value.length) {
    return { text: '今日全天空闲', ok: true }
  }
  if (!freeSlots.value.length) return { text: '今日已排满', ok: false }
  return { text: `今日 ${freeSlots.value.length} 段空闲`, ok: true }
})
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
      <div class="room-card__art-header">
        <span class="room-card__campus">{{ room.campus }} · {{ room.kind }}</span>
        <span class="room-card__rating">
          <el-icon :size="11"><StarFilled /></el-icon>
          {{ room.rating }}
        </span>
      </div>
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
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: stretch;
  padding: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  transition: background var(--dur) var(--ease-out);
}

.room-card:hover {
  background: var(--surface-2);
}

.room-card:focus-visible {
  outline: 2px solid var(--brand-300);
  outline-offset: -2px;
}

.room-card__art {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  height: auto;
  min-height: 132px;
  padding: 16px;
  border-radius: 0;
  flex: none;
}

.room-card__art-header {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  min-width: 0;
}

.room-card__campus {
  display: inline-block;
  max-width: 100%;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.02em;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.room-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: auto;
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.room-card__art-main {
  position: static;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.room-card__code {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-card__place {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-card__watermark {
  display: none;
}

.room-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0 16px 24px;
  min-width: 0;
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
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
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
  box-shadow: none;
  flex: none;
}

.room-card__state.is-full .room-card__dot {
  box-shadow: none;
}

.room-card__distance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  flex: none;
}

.room-card__slots {
  display: flex;
  gap: 4px;
}

.room-card__slot {
  flex: 1;
  height: 4px;
  border-radius: 0;
  background: var(--teal-100);
}

.room-card__slot.is-busy {
  background: var(--line-strong);
}

.room-card__slots-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -4px;
  font-size: 12px;
  color: var(--text-3);
}

.room-card__class {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin: 0px 0 8px;
  font-size: 12px;
  color: var(--text-3);
}

.room-card__class-label {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.room-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 0;
  border-top: none;
  font-size: 12px;
  color: var(--text-3);
}

.room-card__foot > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.room-card__link {
  color: var(--brand-600);
  font-weight: 600;
}

@media (max-width: 620px) {
  .room-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .room-card__art {
    min-height: 122px;
  }

  .room-card__body {
    padding: 16px;
  }
}

@media (max-width: 430px) {
  .room-card__art {
    min-height: 112px;
    padding: 14px;
  }

  .room-card__body {
    gap: 10px;
    padding: 14px;
  }

  .room-card__code {
    font-size: 22px;
  }

  .room-card__topline,
  .room-card__foot {
    flex-wrap: wrap;
  }
}
</style>
