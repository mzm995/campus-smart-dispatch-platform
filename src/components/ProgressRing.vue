<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  size: { type: Number, default: 62 },
  stroke: { type: Number, default: 6 },
  tone: { type: String, default: 'brand' },
  caption: { type: String, default: '' },
})

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - Math.min(100, Math.max(0, props.value)) / 100))
const center = computed(() => props.size / 2)

const colors = {
  brand: ['#6c63ff', '#12b3a6'],
  teal: ['#12b3a6', '#17c3b2'],
  amber: ['#f5a623', '#ff7a59'],
  coral: ['#ff6b6b', '#e5484d'],
  slate: ['#94a0b8', '#7a869f'],
}
const gradient = computed(() => colors[props.tone] || colors.brand)
const gradId = computed(() => `ringGrad_${props.tone}_${props.size}`)
</script>

<template>
  <div class="ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="gradient[0]" />
          <stop offset="1" :stop-color="gradient[1]" />
        </linearGradient>
      </defs>
      <circle :cx="center" :cy="center" :r="radius" fill="none" stroke="var(--line)" :stroke-width="stroke" />
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="`url(#${gradId})`"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${center} ${center})`"
        class="ring__bar"
      />
    </svg>
    <div class="ring__center">
      <slot>
        <span class="ring__value">{{ Math.round(value) }}<small>%</small></span>
        <span v-if="caption" class="ring__caption">{{ caption }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.ring svg {
  position: absolute;
  inset: 0;
}

.ring__bar {
  transition: stroke-dashoffset 0.9s var(--ease-out);
}

.ring__center {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.ring__value {
  font-size: 15px;
  font-weight: 740;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ring__value small {
  font-size: 9px;
  margin-left: 1px;
  color: var(--text-3);
}

.ring__caption {
  margin-top: 2px;
  font-size: 9px;
  color: var(--text-3);
}
</style>
