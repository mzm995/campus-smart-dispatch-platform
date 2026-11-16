<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Clock } from '@element-plus/icons-vue'
import { countdown } from '@/utils/format'

const props = defineProps({
  target: { type: [String, Number, Date], default: '' },
  prefix: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  hint: { type: Boolean, default: true },
})

const tick = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    tick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const info = computed(() => {
  // 依赖 tick 以便每秒刷新
  return { ...countdown(props.target), stamp: tick.value }
})

const text = computed(() => {
  if (info.value.expired) return '已截止'
  if (info.value.days > 0) return `${info.value.days} 天 ${info.value.hours} 小时`
  const mm = String(info.value.hours * 60 + info.value.minutes).padStart(2, '0')
  const ss = String(info.value.seconds).padStart(2, '0')
  return `${mm}:${ss}`
})
</script>

<template>
  <span class="cd" :class="{ 'cd--expired': info.expired, 'cd--compact': compact }">
    <el-icon v-if="!compact" :size="13"><Clock /></el-icon>
    <span class="cd__label">{{ prefix }}</span>
    <span class="cd__value">{{ text }}</span>
  </span>
</template>

<style scoped>
.cd {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.cd__label {
  color: var(--text-3);
}

.cd__value {
  font-weight: 600;
  color: var(--amber-600);
}

.cd--compact {
  font-size: var(--fs-xs);
}

.cd--expired .cd__value {
  color: var(--text-3);
}
</style>
