<script setup>
import { computed } from 'vue'
import { ChatDotRound, School, Search, ShoppingCart } from '@element-plus/icons-vue'
import { SCENE_META } from '@/utils/aiEngine'

const props = defineProps({
  scene: { type: String, default: 'classroom' },
  size: { type: Number, default: 40 },
  soft: { type: Boolean, default: true },
})

const ICONS = {
  classroom: School,
  lostfound: Search,
  groupbuy: ShoppingCart,
  forum: ChatDotRound,
}

const meta = computed(() => SCENE_META[props.scene] || SCENE_META.classroom)
const icon = computed(() => ICONS[props.scene] || School)
</script>

<template>
  <span
    class="scene-icon"
    :class="{ 'scene-icon--solid': !soft }"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <el-icon :size="Math.round(size * 0.48)"><component :is="icon" /></el-icon>
  </span>
</template>

<style scoped>
.scene-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--brand-50);
  color: var(--brand-600);
  border: 1px solid var(--brand-100);
}

.scene-icon--solid {
  border: 1px solid var(--brand-600);
  color: var(--text-invert);
  background: var(--brand-600);
}
</style>
