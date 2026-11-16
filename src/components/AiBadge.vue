<script setup>
import { MagicStick } from '@element-plus/icons-vue'

defineProps({
  text: { type: String, default: 'AI 生成' },
  ghost: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
})
</script>

<template>
  <span class="ai-badge" :class="{ 'ai-badge--ghost': ghost, 'ai-badge--sm': small }">
    <el-icon :size="11"><MagicStick /></el-icon>{{ text }}
  </span>
</template>

<style scoped>
.ai-badge--sm {
  height: 19px;
  padding: 0 7px;
  font-size: 10px;
}
</style>
