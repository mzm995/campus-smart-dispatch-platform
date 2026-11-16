<script setup>
import { Box } from '@element-plus/icons-vue'

defineProps({
  title: { type: String, default: '这里还没有内容' },
  desc: { type: String, default: '换个筛选条件，或者先发布一条吧。' },
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="empty" :class="{ 'empty--compact': compact }">
    <div class="empty__icon">
      <slot name="icon">
        <el-icon :size="26"><Box /></el-icon>
      </slot>
    </div>
    <div class="empty__title">{{ title }}</div>
    <p class="empty__desc">{{ desc }}</p>
    <div v-if="$slots.default" class="empty__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
  text-align: center;
}

.empty--compact {
  padding: 24px 16px;
}

.empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text-3);
}

.empty__title {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-1);
}

.empty__desc {
  margin: 0;
  max-width: 320px;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-3);
}

.empty__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>
