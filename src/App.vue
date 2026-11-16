<script setup>
import { onMounted, ref } from 'vue'

const ready = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true
    const splash = document.getElementById('boot-splash') || document.getElementById('boot')
    if (splash) {
      splash.classList.add('is-hide')
      setTimeout(() => splash.remove(), 420)
    }
  })
})
</script>

<template>
  <div class="app-root" :class="{ 'is-ready': ready }">
    <router-view />
  </div>
</template>

<style scoped>
.app-root {
  opacity: 0;
  transition: opacity 0.3s ease;
}

.app-root.is-ready {
  opacity: 1;
}
</style>
