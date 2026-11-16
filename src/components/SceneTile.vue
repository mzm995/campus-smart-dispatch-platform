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
      <SceneIcon :scene="scene" :size="compact ? 34 : 42" />
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
  padding: 16px;
  text-align: left;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  font-family: inherit;
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), border-color var(--dur);
  overflow: hidden;
}

.scene-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--brand-50), transparent 60%);
  opacity: 0;
  transition: opacity var(--dur);
  pointer-events: none;
}

.scene-tile:hover,
.scene-tile.is-active {
  transform: translateY(-3px);
  border-color: var(--brand-200);
  box-shadow: var(--shadow-md);
}

.scene-tile:hover::before,
.scene-tile.is-active::before {
  opacity: 1;
}

.scene-tile--teal::before {
  background: linear-gradient(135deg, var(--teal-50), transparent 60%);
}

.scene-tile--amber::before {
  background: linear-gradient(135deg, var(--amber-50), transparent 60%);
}

.scene-tile--coral::before {
  background: linear-gradient(135deg, var(--coral-50), transparent 60%);
}

.scene-tile.is-active {
  border-color: var(--brand-400);
}

.scene-tile__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.scene-tile__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 12px;
  transition: all var(--dur) var(--ease-out);
}

.scene-tile:hover .scene-tile__arrow {
  background: var(--brand-500);
  color: #fff;
  transform: translateX(2px);
}

.scene-tile__name {
  position: relative;
  z-index: 1;
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.01em;
}

.scene-tile__desc {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.55;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scene-tile__stat {
  position: relative;
  z-index: 1;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 650;
  color: var(--brand-600);
}

.scene-tile--teal .scene-tile__stat {
  color: var(--teal-600);
}

.scene-tile--amber .scene-tile__stat {
  color: var(--amber-600);
}

.scene-tile--coral .scene-tile__stat {
  color: var(--coral-600);
}

.scene-tile--compact {
  padding: 13px;
}

.scene-tile--compact .scene-tile__desc {
  display: none;
}
</style>
