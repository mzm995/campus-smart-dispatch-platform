<script setup>
import { computed, ref, watch } from 'vue'
import {
  Calendar,
  CircleCheck,
  Clock,
  Close,
  Location,
  MagicStick,
  StarFilled,
  Warning,
} from '@element-plus/icons-vue'
import AiBadge from '@/components/AiBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  room: { type: Object, default: null },
  day: { type: Number, default: 3 },
  date: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'apply'])

const classroom = useClassroomStore()
const activeDay = ref(3)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) activeDay.value = Number(props.day) || Number(classroom.criteria.day) || 3
  },
)

watch(
  () => props.day,
  (day) => {
    if (props.modelValue && day) activeDay.value = Number(day)
  },
)

const dayOptions = computed(() => {
  const days = new Set([1, 2, 3, 4, 5])
  if (activeDay.value > 5) days.add(activeDay.value)
  return [...days].sort((a, b) => a - b)
})

const dayLabel = computed(() => WEEK_CN[Number(activeDay.value) % 7])
const dayBusy = computed(() =>
  (props.room?.busy || [])
    .filter((item) => Number(item.day) === Number(activeDay.value))
    .sort((a, b) => a.start.localeCompare(b.start)),
)
const freeSlots = computed(() =>
  props.room ? classroom.freeSlotsOf(props.room, activeDay.value, props.date) : [],
)
const criteriaSlot = computed(() => {
  const criteria = classroom.criteria
  return {
    day: Number(criteria.day),
    start: criteria.start,
    end: criteria.end,
  }
})
const checkingCriteria = computed(() => criteriaSlot.value.day === activeDay.value)
const criteriaConflict = computed(() => {
  if (!props.room || !checkingCriteria.value) return false
  return !classroom.roomFreeAt(
    props.room,
    activeDay.value,
    criteriaSlot.value.start,
    criteriaSlot.value.end,
    props.date,
  )
})

function applyRoom() {
  if (!props.room) return
  visible.value = false
  emit('apply', { room: props.room, day: activeDay.value })
}
</script>

<template>
  <el-drawer
    v-model="visible"
    size="min(480px, 100%)"
    :with-header="false"
    append-to-body
    class="classroom-drawer"
  >
    <div v-if="room" class="rd">
      <div class="rd__hero media-cover" :class="`media-cover--${room.tone || 'brand'}`">
        <button type="button" class="rd__close" aria-label="关闭" @click="visible = false">
          <el-icon :size="16"><Close /></el-icon>
        </button>
        <span class="rd__campus">{{ room.campus }} · {{ room.building }} · {{ room.kind }}</span>
        <div class="rd__code">{{ room.code }}</div>
        <div class="rd__meta">
          <span><el-icon :size="12"><Location /></el-icon> {{ room.floor }} 层</span>
          <span>{{ room.capacity ? `${room.capacity} 座` : '容量待核' }}</span>
          <span><el-icon :size="12"><StarFilled /></el-icon> {{ room.rating }}</span>
          <span>距你 {{ room.distance }}m</span>
        </div>
      </div>

      <div class="tag-row rd__tags">
        <span v-for="item in room.equipment" :key="item" class="tag-soft tag-soft--brand">{{ item }}</span>
      </div>

      <div v-if="room.className || room.headTeacher || room.teacher || room.computer" class="rd__meta-card">
        <div v-if="room.className" class="rd__meta-row">
          <span>班级</span>
          <strong>{{ room.className }}</strong>
        </div>
        <div v-if="room.headTeacher" class="rd__meta-row">
          <span>班主任</span>
          <strong>{{ room.headTeacher }}</strong>
        </div>
        <div v-if="room.teacher" class="rd__meta-row">
          <span>授课教师</span>
          <strong>{{ room.teacher }}</strong>
        </div>
        <div v-if="room.computer" class="rd__meta-row">
          <span>机房配置</span>
          <strong>{{ room.computer }}</strong>
        </div>
      </div>

      <div class="rd__ai">
        <div class="rd__ai-head">
          <span class="rd__label">
            <el-icon :size="13"><MagicStick /></el-icon>
            AI 课表核验
          </span>
          <AiBadge ghost small />
        </div>
        <p class="rd__ai-text">
          {{ dayLabel }}共有 {{ dayBusy.length }} 节课安排，空闲 {{ freeSlots.length }} 段。
          <template v-if="checkingCriteria">
            你选择的 {{ criteriaSlot.start }}–{{ criteriaSlot.end }}
            <b :class="criteriaConflict ? 'text-amber' : 'text-teal'">
              {{ criteriaConflict ? '与课表冲突' : '可以借用' }}
            </b>
            。
          </template>
        </p>
        <div v-if="criteriaConflict" class="notice notice--amber rd__warn">
          <el-icon :size="14"><Warning /></el-icon>
          <span>该时段与已有课程重叠，建议切换时段，或提交后由管理员人工协调。</span>
        </div>
        <p v-else class="rd__ok">
          <el-icon :size="13"><CircleCheck /></el-icon>
          已同步本周课表，空闲时段数据仅供参考
        </p>
      </div>

      <div class="rd__section">
        <div class="rd__section-head">
          <span class="rd__label">
            <el-icon :size="13"><Calendar /></el-icon>
            当天课表
          </span>
          <div class="rd__days">
            <button
              v-for="day in dayOptions"
              :key="day"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': activeDay === day }"
              @click="activeDay = day"
            >
              {{ WEEK_CN[day % 7] }}
            </button>
          </div>
        </div>

        <div v-if="dayBusy.length" class="rd__busy">
          <div v-for="busy in dayBusy" :key="`${busy.start}-${busy.label}`" class="rd__busy-row">
            <span class="rd__busy-time">{{ busy.start }}–{{ busy.end }}</span>
            <span class="rd__busy-label">{{ busy.label }}</span>
            <span class="tag-soft tag-soft--amber">已占用</span>
          </div>
        </div>
        <EmptyState
          v-else
          compact
          title="当天没有排课"
          desc="教室整天空闲，适合连续时段使用。"
        />
      </div>

      <div class="rd__section">
        <span class="rd__label">
          <el-icon :size="13"><Clock /></el-icon>
          空闲时段
        </span>
        <div class="tag-row mt-2">
          <span v-for="slot in freeSlots" :key="slot.start" class="tag-soft tag-soft--teal">
            {{ slot.start }}–{{ slot.end }}
          </span>
          <span v-if="!freeSlots.length" class="faint t-sm">当天已无空闲时段</span>
        </div>
        <p class="rd__tip">08:00–21:00 之间，已扣除当天课程占用时段</p>
      </div>

      <div class="rd__foot">
        <div class="rd__foot-text">
          <strong>{{ room.code }}</strong>
          <span>{{ dayLabel }} · {{ freeSlots.length }} 段空闲</span>
        </div>
        <el-button type="primary" @click="applyRoom">借用这间</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.rd {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.rd__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  height: 158px;
  padding: 16px;
  border-radius: var(--radius-lg);
  flex: none;
}

.rd__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(17, 21, 39, 0.08);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.2s var(--ease-out);
}

.rd__close:hover {
  background: var(--surface);
}

.rd__campus {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-weight: 600;
}

.rd__code {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--text-1);
}

.rd__meta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  opacity: 0.86;
}

.rd__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rd__tags {
  gap: 4px;
}

.rd__meta-card {
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.rd__meta-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  line-height: 1.6;
}

.rd__meta-row span {
  flex: none;
  color: var(--text-3);
}

.rd__meta-row strong {
  color: var(--text-1);
  font-weight: 600;
  text-align: right;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rd__ai {
  padding: 12px 12px;
  border: 1px solid var(--brand-200);
  border-radius: var(--radius);
  background: var(--brand-50);
}

.rd__ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rd__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-700);
  letter-spacing: 0.02em;
}

.rd__ai-text {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.rd__ai-text b {
  font-weight: 700;
}

.rd__warn {
  margin-top: 8px;
  padding: 8px 8px;
  font-size: 12px;
}

.rd__ok {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--teal-600);
}

.rd__section {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.rd__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.rd__days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rd__days .chip {
  font-family: inherit;
}

.rd__busy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.rd__busy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-3);
}

.rd__busy-time {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--amber-600);
  font-variant-numeric: tabular-nums;
}

.rd__busy-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rd__tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.rd__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.rd__foot-text {
  display: flex;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
}

.rd__foot-text strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: 0;
}

.rd__foot-text span {
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .rd__code {
    font-size: 24px;
  }

  .rd__foot {
    position: sticky;
    bottom: -20px;
    margin: 0 -20px -20px;
    padding: 12px 16px 16px;
    background: rgba(255, 255, 255, 0.96);
  }
}
</style>
