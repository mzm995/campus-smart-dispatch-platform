<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  text: { type: String, default: '' },
  tone: { type: String, default: '' },
  dot: { type: Boolean, default: true },
})

const MAP = {
  pending: { text: '待审核', tone: 'amber' },
  approved: { text: '已通过', tone: 'teal' },
  rejected: { text: '已驳回', tone: 'coral' },
  cancelled: { text: '已取消', tone: 'slate' },
  matching: { text: '匹配中', tone: 'brand' },
  resolved: { text: '已完成', tone: 'teal' },
  ongoing: { text: '进行中', tone: 'brand' },
  success: { text: '已成团', tone: 'teal' },
  expired: { text: '已结束', tone: 'slate' },
  open: { text: '待处理', tone: 'coral' },
  done: { text: '已处理', tone: 'teal' },
  waiting: { text: '待确认', tone: 'amber' },
}

const current = computed(() => {
  const base = MAP[props.status] || { text: props.status || '未知', tone: 'slate' }
  return { text: props.text || base.text, tone: props.tone || base.tone }
})
</script>

<template>
  <span class="pill" :class="[`pill--${current.tone}`, { 'pill--plain': !dot }]">
    <span v-if="dot" class="pill__dot"></span>{{ current.text }}
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 500;
  white-space: nowrap;
  background: var(--surface-3);
  color: var(--text-2);
}

.pill__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.85;
}

.pill--brand {
  background: var(--brand-50);
  color: var(--brand-700);
}

.pill--teal {
  background: var(--teal-50);
  color: var(--teal-700);
}

.pill--amber {
  background: var(--amber-50);
  color: var(--amber-700);
}

.pill--coral {
  background: var(--coral-50);
  color: var(--coral-700);
}

.pill--slate {
  background: var(--surface-3);
  color: var(--text-3);
}
</style>
