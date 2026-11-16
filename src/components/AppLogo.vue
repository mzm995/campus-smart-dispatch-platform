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
      <defs>
        <linearGradient id="csdpLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6C63FF" />
          <stop offset="0.55" stop-color="#8071FF" />
          <stop offset="1" stop-color="#12B3A6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#csdpLogoGrad)" />
      <circle cx="20" cy="12.2" r="2.5" fill="#fff" />
      <path
        d="M11.6 27.2v-1.1c0-4.3 3.7-7.8 8.4-7.8s8.4 3.5 8.4 7.8v1.1"
        stroke="#fff"
        stroke-width="2.3"
        stroke-linecap="round"
      />
      <path d="M20 4.6v2M8.9 8.2l1.4 1.5M31.1 8.2l-1.4 1.5" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity="0.85" />
    </svg>
    <div v-if="showText && !compact" class="logo__text">
      <div class="logo__name">校园智能调度平台</div>
      <div class="logo__sub">AI 智能调度</div>
    </div>
  </div>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo__mark {
  flex: none;
  border-radius: 12px;
  box-shadow: 0 10px 22px -12px rgba(108, 99, 255, 0.9);
}

.logo__text {
  min-width: 0;
  line-height: 1.2;
}

.logo__name {
  font-size: 17px;
  font-weight: 760;
  letter-spacing: 0.02em;
  color: var(--text-1);
}

.logo__sub {
  margin-top: 3px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-3);
  text-transform: uppercase;
}

.logo--light .logo__name {
  color: #fff;
}

.logo--light .logo__sub {
  color: rgba(255, 255, 255, 0.55);
}
</style>
