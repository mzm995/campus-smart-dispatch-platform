<script setup>
defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '—' },
  suffix: { type: String, default: '' },
  hint: { type: String, default: '' },
  delta: { type: String, default: '' },
  deltaDown: { type: Boolean, default: false },
  tone: { type: String, default: 'brand' },
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="stat" :class="[`stat--${tone}`, { 'stat--compact': compact }]">
    <div class="stat__top">
      <span class="stat__label">{{ label }}</span>
      <span v-if="$slots.icon" class="stat__icon"><slot name="icon" /></span>
    </div>
    <div class="stat__value-row">
      <span class="stat__value">{{ value }}<small v-if="suffix" class="stat__suffix">{{ suffix }}</small></span>
      <span v-if="delta" class="stat__delta" :class="{ 'stat__delta--down': deltaDown }">
        {{ deltaDown ? '↓' : '↑' }} {{ delta }}
      </span>
    </div>
    <div v-if="hint" class="stat__hint">{{ hint }}</div>
    <slot />
  </div>
</template>

<style scoped>
.stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.stat__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat__label {
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-500);
  font-size: var(--fs-base);
}

.stat--teal .stat__icon {
  color: var(--teal-500);
}

.stat--amber .stat__icon {
  color: var(--amber-500);
}

.stat--coral .stat__icon {
  color: var(--coral-500);
}

.stat__value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat__value {
  font-family: var(--font-serif);
  font-size: var(--fs-3xl);
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.1;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.stat--compact .stat__value {
  font-size: var(--fs-2xl);
}

.stat__suffix {
  margin-left: 4px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  font-weight: 400;
  color: var(--text-3);
}

.stat__delta {
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--teal-600);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stat__delta--down {
  color: var(--coral-600);
}

.stat__hint {
  font-size: var(--fs-xs);
  color: var(--text-3);
  line-height: 1.6;
}
</style>
