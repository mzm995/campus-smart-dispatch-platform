<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import {
  Calendar,
  CircleCheck,
  MagicStick,
  User,
  Warning,
} from '@element-plus/icons-vue'
import AiBadge from '@/components/AiBadge.vue'
import { useClassroomStore } from '@/stores/classroom'
import { useUserStore } from '@/stores/user'
import { WEEK_CN, nextDate } from '@/utils/format'
import { roomFreeAt, sleep } from '@/utils/aiEngine'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  room: { type: Object, default: null },
  prefill: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'submitted'])

const classroom = useClassroomStore()
const user = useUserStore()
const router = useRouter()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const formRef = ref(null)
const submitting = ref(false)

const form = reactive({
  date: '',
  start: '15:00',
  end: '17:00',
  people: 30,
  purpose: '班会',
  note: '',
})

const rules = {
  date: [{ required: true, message: '请选择使用日期', trigger: 'change' }],
  people: [{ required: true, message: '请填写预计人数', trigger: 'blur' }],
  purpose: [{ required: true, message: '请选择或填写用途', trigger: 'change' }],
}

const slotPresets = computed(() => {
  const presets = classroom.filters.slots.map((slot) => ({
    label: slot.label,
    start: slot.start,
    end: slot.end,
  }))
  presets.push({ label: '15:00–17:00', start: '15:00', end: '17:00' })
  return presets
})

const startOptions = Array.from({ length: 13 }, (_, index) => `${String(8 + index).padStart(2, '0')}:00`)
const endOptions = Array.from({ length: 13 }, (_, index) => `${String(9 + index).padStart(2, '0')}:00`)

const selectedDay = computed(() => {
  if (!form.date) return 0
  const day = dayjs(form.date).day()
  return day === 0 ? 7 : day
})

const dayLabel = computed(() => (selectedDay.value ? WEEK_CN[selectedDay.value % 7] : '—'))

const conflict = computed(() => {
  if (!props.room || !form.date || !selectedDay.value) return false
  return !roomFreeAt(props.room, selectedDay.value, form.start, form.end)
})

const aiReason = computed(() => {
  if (!props.room) return ''
  const crowd = form.people ? `${form.people} 人` : '当前人数'
  const capText = props.room.capacity ? `容量 ${props.room.capacity} 人 ≥ ${crowd}` : '该场地容量待核'
  return `${capText}，配备${props.room.equipment.join('、')}，${
    dayLabel.value
  } ${form.start}–${form.end} ${conflict.value ? '课表存在冲突，需人工复核' : '时段空闲'}，距 A 栋约 ${
    props.room.distance
  }m。`
})

function resetForm() {
  const preset = props.prefill || {}
  const fallbackDay = Number(preset.day) || Number(classroom.criteria.day) || 3
  const safeDay = fallbackDay >= 1 && fallbackDay <= 7 ? fallbackDay : 3
  form.date = nextDate(safeDay).format('YYYY-MM-DD')
  form.start = preset.start || classroom.criteria.start || '15:00'
  form.end = preset.end || classroom.criteria.end || '17:00'
  form.people = Math.min(
    Number(preset.people) || Number(classroom.criteria.capacity) || 30,
    props.room?.capacity || 200,
  )
  form.purpose = preset.purpose || classroom.criteria.purpose || '班会'
  form.note = ''
  nextTick(() => formRef.value?.clearValidate())
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm()
  },
)

watch(
  () => props.room?.id,
  () => {
    if (props.modelValue) resetForm()
  },
)

function disablePastDate(date) {
  return dayjs(date).isBefore(dayjs().startOf('day'))
}

function usePreset(preset) {
  form.start = preset.start
  form.end = preset.end
}

async function submit() {
  if (!props.room) return
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  if (form.start >= form.end) {
    ElMessage.warning('结束时间需要晚于开始时间')
    return
  }
  if (!props.room.capacity) {
    ElMessage.warning('该场地容量待核，请先联系管理员确认后再提交')
    return
  }
  if (Number(form.people) > props.room.capacity) {
    ElMessage.warning(`该场地最多容纳 ${props.room.capacity} 人，请调整人数`)
    return
  }

  submitting.value = true
  await sleep(700)
  const application = classroom.apply({
    roomId: props.room.id,
    date: form.date,
    day: selectedDay.value,
    start: form.start,
    end: form.end,
    purpose: form.purpose,
    people: Number(form.people),
    contact: '站内联系',
    note: form.note,
    aiReason: aiReason.value,
  })
  submitting.value = false

  if (!application) {
    ElMessage.error('申请提交失败，请稍后重试')
    return
  }
  visible.value = false
  ElMessage.success('申请已提交，等待管理员审核')
  emit('submitted', application)
  router.push(`/classroom/status/${application.id}`)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    width="min(560px, 94vw)"
    align-center
    append-to-body
    :show-close="!submitting"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
  >
    <template #header>
      <div class="ad-head">
        <span class="ad-head__orb">
          <el-icon :size="17"><MagicStick /></el-icon>
        </span>
        <div class="ad-head__text">
          <div class="ad-head__title">
            借用场所
            <span v-if="room" class="ad-head__code">{{ room.code }}</span>
          </div>
          <p v-if="room" class="ad-head__sub">
            {{ room.campus }} · {{ room.building }} · {{ room.floor }} 层 · {{ room.capacity ? `可容纳 ${room.capacity} 人` : '容量待核' }}
          </p>
        </div>
        <AiBadge ghost small text="AI 预填" />
      </div>
    </template>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="ad-form" @submit.prevent>
      <div class="ad-grid">
        <el-form-item label="使用日期" prop="date">
          <el-date-picker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            :disabled-date="disablePastDate"
            :clearable="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="预计人数" prop="people">
          <el-input-number
            v-model="form.people"
            :min="1"
            :max="room?.capacity || 200"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <el-form-item label="使用时段" class="ad-time-item">
        <div class="ad-time">
          <el-select v-model="form.start" placeholder="开始时间">
            <el-option v-for="time in startOptions" :key="`s-${time}`" :label="time" :value="time" />
          </el-select>
          <span class="ad-time__dash">—</span>
          <el-select v-model="form.end" placeholder="结束时间">
            <el-option v-for="time in endOptions" :key="`e-${time}`" :label="time" :value="time" />
          </el-select>
        </div>
        <div class="ad-presets">
          <button
            v-for="preset in slotPresets"
            :key="preset.label"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': form.start === preset.start && form.end === preset.end }"
            @click="usePreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </el-form-item>

      <el-form-item label="用途" prop="purpose">
        <el-select v-model="form.purpose" filterable allow-create default-first-option placeholder="选择或输入用途" style="width: 100%">
          <el-option v-for="purpose in classroom.filters.purposes" :key="purpose" :label="purpose" :value="purpose" />
        </el-select>
      </el-form-item>

      <el-form-item label="备注（选填）">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="120"
          show-word-limit
          placeholder="例如：需要提前 10 分钟到场调试投影"
        />
      </el-form-item>
    </el-form>

    <div class="ad-ai">
      <div class="ad-ai__head">
        <span class="ad-ai__label">
          <el-icon :size="13"><MagicStick /></el-icon>
          AI 核验结论
        </span>
        <AiBadge ghost small />
      </div>
      <p class="ad-ai__text">{{ aiReason }}</p>
      <div v-if="!room.capacity" class="notice notice--amber ad-ai__warn">
        <el-icon :size="14"><Warning /></el-icon>
        <span>该场地容量待核，提交后需管理员确认容量与人数是否匹配。</span>
      </div>
      <div v-else-if="conflict" class="notice notice--amber ad-ai__warn">
        <el-icon :size="14"><Warning /></el-icon>
        <span>课表显示该时段已有课程安排，提交后管理员会人工复核，建议更换时段或场地。</span>
      </div>
      <p v-else class="ad-ai__ok">
        <el-icon :size="13"><CircleCheck /></el-icon>
        容量、设备与时段均满足要求
      </p>
      <div class="ad-ai__meta">
        <span><el-icon :size="11"><Calendar /></el-icon> {{ form.date || '待选择日期' }} · {{ dayLabel }}</span>
        <span><el-icon :size="11"><User /></el-icon> 申请人：{{ user.user?.name || '林小满' }}</span>
      </div>
    </div>

    <template #footer>
      <div class="ad-foot">
        <span class="ad-foot__hint">提交后进入管理员审核，预计 2 小时内完成</span>
        <div class="ad-foot__actions">
          <el-button :disabled="submitting" @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="submit">
            {{ submitting ? 'AI 核验中…' : '提交申请' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.ad-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ad-head__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
  box-shadow: 0 10px 20px -12px rgba(108, 99, 255, 0.9);
}

.ad-head__text {
  flex: 1;
  min-width: 0;
}

.ad-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-lg);
  font-weight: 720;
  letter-spacing: -0.02em;
  color: var(--text-1);
}

.ad-head__code {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.ad-head__sub {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.ad-form {
  display: flex;
  flex-direction: column;
}

.ad-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.ad-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.ad-form :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.ad-time-item :deep(.el-form-item__content) {
  display: block;
}

.ad-time {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ad-time .el-select {
  flex: 1;
  min-width: 0;
}

.ad-time__dash {
  color: var(--text-3);
  flex: none;
}

.ad-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.ad-presets .chip {
  font-family: inherit;
}

.ad-ai {
  padding: 14px;
  border: 1px dashed var(--brand-200);
  border-radius: var(--radius);
  background: linear-gradient(135deg, rgba(238, 236, 255, 0.7), rgba(230, 250, 247, 0.6));
}

.ad-ai__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ad-ai__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--brand-700);
  letter-spacing: 0.02em;
}

.ad-ai__text {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.ad-ai__warn {
  margin-top: 9px;
  padding: 9px 11px;
  font-size: 11.5px;
}

.ad-ai__ok {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--teal-600);
}

.ad-ai__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed rgba(108, 99, 255, 0.2);
  font-size: 10.5px;
  color: var(--text-3);
}

.ad-ai__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ad-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ad-foot__hint {
  font-size: 11px;
  color: var(--text-3);
}

.ad-foot__actions {
  display: flex;
  gap: 8px;
  flex: none;
}

@media (max-width: 640px) {
  .ad-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ad-foot {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .ad-foot__hint {
    text-align: left;
  }

  .ad-foot__actions {
    justify-content: flex-end;
  }
}
</style>
