<script setup>
import { computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { SCENE_META } from '@/utils/aiEngine'
import SceneIcon from './SceneIcon.vue'

const props = defineProps({
  scene: { type: String, required: true },
  stat: { type: String, default: '' },
  desc: { type: String, default: '' },
  active: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const meta = computed(() => SCENE_META[props.scene] || SCENE_META.classroom)
</script>

<template>
  <button type="button" class="scene-tile" :class="[`scene-tile--${meta.tone}`, { 'is-active': active, 'scene-tile--compact': compact }]">
    <div class="scene-tile__top">
      <SceneIcon :scene="scene" :size="compact ? 30 : 34" />
      <span class="scene-tile__arrow"><el-icon><ArrowRight /></el-icon></span>
    </div>
    <div class="scene-tile__name">{{ meta.name }}</div>
    <p class="scene-tile__desc">{{ desc || meta.tagline }}</p>
    <div v-if="stat" class="scene-tile__stat">{{ stat }}</div>
  </button>
</template>

<style scoped>
.scene-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 24px 0 16px;
  text-align: left;
  border: none;
  border-top: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--dur) var(--ease-out);
}

.scene-tile::after {
  content: '';
  position: absolute;
  inset: -1px 0 0;
  border-top: 1px solid var(--text-1);
  opacity: 0;
  transition: opacity var(--dur) var(--ease-out);
  pointer-events: none;
}

.scene-tile:hover::after,
.scene-tile.is-active::after {
  opacity: 1;
}

.scene-tile:focus-visible {
  outline: 2px solid var(--brand-400);
  outline-offset: 2px;
}

.scene-tile__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.scene-tile__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-4);
  font-size: var(--fs-xs);
  transition:
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.scene-tile:hover .scene-tile__arrow {
  color: var(--brand-600);
  transform: translateX(2px);
}

.scene-tile__name {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: 0.01em;
}

.scene-tile__desc {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scene-tile__stat {
  margin-top: auto;
  padding-top: 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--text-2);
}

.scene-tile--compact {
  padding: 16px 0 8px;
}

.scene-tile--compact .scene-tile__desc {
  display: none;
}
</style>
