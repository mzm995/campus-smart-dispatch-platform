<script setup>
import { computed } from 'vue'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({
  names: { type: Array, default: () => [] },
  max: { type: Number, default: 4 },
  size: { type: Number, default: 28 },
  showMore: { type: Boolean, default: true },
})

const list = computed(() =>
  props.names.map((item) => {
    const name = typeof item === 'string' ? item : item.name
    return {
      name,
      userId: typeof item === 'string' ? '' : item.userId,
      src: typeof item === 'string' ? '' : item.avatarUrl,
    }
  }),
)

const visible = computed(() => list.value.slice(0, props.max))
const more = computed(() => Math.max(0, list.value.length - props.max))
</script>

<template>
  <div class="stack" :style="{ '--avatar-size': `${size}px` }">
    <UserAvatar
      v-for="(item, index) in visible"
      :key="`${item.name}-${index}`"
      class="stack__item"
      :name="item.name"
      :user-id="item.userId"
      :src="item.src"
      :size="size"
    />
    <span v-if="showMore && more > 0" class="stack__item stack__more">+{{ more }}</span>
  </div>
</template>

<style scoped>
.stack {
  display: inline-flex;
  align-items: center;
}

.stack__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--avatar-size);
  height: var(--avatar-size);
  margin-left: -7px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  color: #fff;
  font-size: calc(var(--avatar-size) * 0.36);
  font-weight: 700;
  letter-spacing: 0;
  flex: none;
  box-shadow: var(--shadow-xs);
}

.stack__item:first-child {
  margin-left: 0;
}

.stack__more {
  background: var(--surface-3);
  color: var(--text-2);
  font-size: calc(var(--avatar-size) * 0.32);
}
</style>
