<script setup>
defineProps({
  size: { type: Number, default: 36 },
  showText: { type: Boolean, default: true },
  light: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="logo" :class="{ 'logo--light': light }">
    <svg class="logo__mark" :width="size" :height="size" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="4" fill="#33546b" />
      <path d="M11 27V13" stroke="#fffdfa" stroke-width="1.6" stroke-linecap="square" opacity="0.55" />
      <path d="M11 16.5h9.5M11 23.5h13" stroke="#fffdfa" stroke-width="1.6" stroke-linecap="square" />
      <circle cx="26.5" cy="16.5" r="2.6" fill="#fffdfa" />
      <circle cx="20.5" cy="23.5" r="2.6" fill="none" stroke="#fffdfa" stroke-width="1.6" />
    </svg>
    <div v-if="showText && !compact" class="logo__text">
      <div class="logo__name">校园智能调度平台</div>
      <div class="logo__sub">CAMPUS DISPATCH</div>
    </div>
  </div>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.logo__mark {
  flex: none;
  border-radius: 4px;
}

.logo__text {
  min-width: 0;
  line-height: 1.2;
}

.logo__name {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-1);
  white-space: nowrap;
}

.logo__sub {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--text-4);
}

.logo--light .logo__name {
  color: var(--text-invert);
}

.logo--light .logo__sub {
  color: rgba(255, 253, 250, 0.5);
}
</style>
