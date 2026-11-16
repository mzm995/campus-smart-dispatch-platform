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
      <span class="kpi-label">{{ label }}</span>
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-xs);
  min-width: 0;
}

.stat::after {
  content: '';
  position: absolute;
  top: -40px;
  right: -40px;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--brand-100), transparent 70%);
  opacity: 0.8;
  pointer-events: none;
}

.stat--teal::after {
  background: radial-gradient(circle, var(--teal-100), transparent 70%);
}

.stat--amber::after {
  background: radial-gradient(circle, var(--amber-100), transparent 70%);
}

.stat--coral::after {
  background: radial-gradient(circle, var(--coral-100), transparent 70%);
}

.stat__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 15px;
}

.stat--teal .stat__icon {
  background: var(--teal-50);
  color: var(--teal-600);
}

.stat--amber .stat__icon {
  background: var(--amber-50);
  color: var(--amber-600);
}

.stat--coral .stat__icon {
  background: var(--coral-50);
  color: var(--coral-600);
}

.stat__value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.stat__value {
  font-size: var(--fs-3xl);
  font-weight: 740;
  letter-spacing: -0.035em;
  line-height: 1.1;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.stat--compact .stat__value {
  font-size: var(--fs-2xl);
}

.stat__suffix {
  margin-left: 3px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-3);
}

.stat__delta {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--teal-50);
  color: var(--teal-600);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat__delta--down {
  background: var(--coral-50);
  color: var(--coral-600);
}

.stat__hint {
  font-size: var(--fs-xs);
  color: var(--text-3);
  line-height: 1.5;
  position: relative;
  z-index: 1;
}
</style>
