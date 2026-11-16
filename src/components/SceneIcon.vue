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
    :class="[`scene-icon--${meta.tone}`, { 'scene-icon--solid': !soft }]"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.32)}px` }"
  >
    <el-icon :size="Math.round(size * 0.46)"><component :is="icon" /></el-icon>
  </span>
</template>

<style scoped>
.scene-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: var(--brand-50);
  color: var(--brand-600);
  border: 1px solid var(--brand-100);
}

.scene-icon--teal {
  background: var(--teal-50);
  color: var(--teal-600);
  border-color: var(--teal-100);
}

.scene-icon--amber {
  background: var(--amber-50);
  color: var(--amber-600);
  border-color: var(--amber-100);
}

.scene-icon--coral {
  background: var(--coral-50);
  color: var(--coral-600);
  border-color: var(--coral-100);
}

.scene-icon--solid {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #6c63ff, #8f7bff);
}

.scene-icon--solid.scene-icon--teal {
  background: linear-gradient(135deg, #17c3b2, #0f9d92);
}

.scene-icon--solid.scene-icon--amber {
  background: linear-gradient(135deg, #ffb02e, #ff7a59);
}

.scene-icon--solid.scene-icon--coral {
  background: linear-gradient(135deg, #ff8a8a, #e5484d);
}
</style>
