<script setup>
import { computed, onMounted } from 'vue'
import { avatarGradient, initialOf } from '@/utils/format'
import { apiAssetUrl } from '@/utils/api'
import { useAvatarDirectoryStore } from '@/stores/avatar'

const props = defineProps({
  name: { type: String, default: '' },
  userId: { type: String, default: '' },
  src: { type: String, default: '' },
  preferSrc: { type: Boolean, default: false },
  size: { type: Number, default: 32 },
  radius: { type: [Number, String], default: '50%' },
  alt: { type: String, default: '' },
})

const avatars = useAvatarDirectoryStore()

onMounted(() => avatars.start())

const resolvedUrl = computed(() => {
  const direct = String(props.src || '').trim()
  const directUrl = direct
    ? /^(?:https?:|blob:|data:)/i.test(direct)
      ? direct
      : apiAssetUrl(direct)
    : ''
  if (props.preferSrc && directUrl) return directUrl
  const directoryUrl = avatars.resolve(props.name, props.userId)
  if (directoryUrl) return directoryUrl
  return directUrl
})

const rootStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius:
    typeof props.radius === 'number' ? `${props.radius}px` : props.radius,
  background: avatarGradient(props.name || 'guest'),
  fontSize: `${Math.max(10, Math.round(props.size * 0.36))}px`,
}))
</script>

<template>
  <span class="user-avatar" :style="rootStyle" :title="name">
    <img
      v-if="resolvedUrl"
      :src="resolvedUrl"
      :alt="alt || `${name || '用户'}的头像`"
    />
    <template v-else>{{ initialOf(name) }}</template>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
  color: var(--text-invert);
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
