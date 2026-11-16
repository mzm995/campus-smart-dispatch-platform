<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MagicStick } from '@element-plus/icons-vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  title: { type: String, default: 'AI 正在理解你的需求' },
  subtitle: { type: String, default: '意图识别 → 要素抽取 → 资源匹配 → 生成结果' },
  interval: { type: Number, default: 620 },
})

const active = ref(0)
let timer = null

function start() {
  active.value = 0
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (active.value < props.steps.length - 1) active.value += 1
  }, props.interval)
}

onMounted(start)
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

watch(
  () => props.steps,
  () => start(),
  { deep: true },
)

const progress = computed(() => Math.round(((active.value + 1) / Math.max(1, props.steps.length)) * 100))
</script>

<template>
  <div class="think">
    <div class="think__orb">
      <span class="think__ring"></span>
      <span class="think__ring think__ring--2"></span>
      <el-icon :size="26" class="think__icon"><MagicStick /></el-icon>
    </div>
    <div class="think__title">{{ title }}</div>
    <div class="think__sub">{{ subtitle }}</div>

    <ul class="think__steps">
      <li
        v-for="(step, index) in steps"
        :key="step"
        class="think__step"
        :class="{ 'is-done': index < active, 'is-active': index === active }"
      >
        <span class="think__dot">
          <span v-if="index < active">✓</span>
          <span v-else-if="index === active" class="think__spin"></span>
          <span v-else class="think__idle"></span>
        </span>
        <span class="think__label">{{ step }}</span>
      </li>
    </ul>

    <div class="think__bar">
      <span :style="{ width: `${progress}%` }"></span>
    </div>
  </div>
</template>

<style scoped>
.think {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 8px 4px;
  text-align: center;
}

.think__orb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: var(--brand-600);
  box-shadow: none;
}

.think__icon {
  color: #fff;
  animation: think-float 2.4s ease-in-out infinite;
}

.think__ring {
  position: absolute;
  inset: -10px;
  border-radius: 8px;
  border: 1px solid var(--brand-200);
  animation: think-pulse 2.2s ease-out infinite;
}

.think__ring--2 {
  animation-delay: 1.1s;
}

.think__title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text-1);
}

.think__sub {
  margin-top: 4px;
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
  color: var(--text-3);
}

.think__steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(340px, 100%);
  margin: 24px 0 16px;
  padding: 0;
  list-style: none;
  text-align: left;
}

.think__step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text-3);
  font-size: var(--fs-sm);
  transition: all 0.35s var(--ease-out);
}

.think__step.is-active {
  border-color: var(--brand-200);
  background: var(--brand-50);
  color: var(--brand-700);
  transform: translateX(2px);
}

.think__step.is-done {
  color: var(--text-2);
}

.think__dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--teal-600);
  font-size: 12px;
  font-weight: 700;
  flex: none;
}

.think__step.is-done .think__dot {
  background: var(--teal-50);
}

.think__spin {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--brand-300);
  border-top-color: var(--brand-600);
  animation: think-spin 0.8s linear infinite;
}

.think__idle {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-4);
}

.think__label {
  flex: 1;
}

.think__bar {
  width: min(340px, 100%);
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  overflow: hidden;
}

.think__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand-600);
  transition: width 0.6s var(--ease-out);
}

@keyframes think-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes think-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-3px) rotate(6deg);
  }
}

@keyframes think-pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.18);
    opacity: 0;
  }
}
</style>
