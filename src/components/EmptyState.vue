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
  padding: 52px 20px;
  text-align: center;
}

.empty--compact {
  padding: 28px 14px;
}

.empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  margin-bottom: 6px;
  border-radius: 20px;
  background: var(--grad-brand-soft);
  color: var(--brand-500);
}

.empty__title {
  font-size: var(--fs-md);
  font-weight: 680;
  color: var(--text-1);
}

.empty__desc {
  margin: 0;
  max-width: 320px;
  font-size: var(--fs-sm);
  line-height: 1.65;
  color: var(--text-3);
}

.empty__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
