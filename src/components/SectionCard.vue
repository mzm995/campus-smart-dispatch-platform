<script setup>
defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  padded: { type: Boolean, default: true },
  flush: { type: Boolean, default: false },
})
</script>

<template>
  <section class="sec" :class="{ 'sec--flush': flush }">
    <div v-if="title || $slots.actions || $slots.title" class="sec__head">
      <div class="sec__title-wrap">
        <h3 v-if="$slots.title" class="sec__title">
          <slot name="title" />
        </h3>
        <h3 v-else class="sec__title">{{ title }}</h3>
        <p v-if="desc" class="sec__desc">{{ desc }}</p>
      </div>
      <div v-if="$slots.actions" class="sec__actions">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.sec {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.sec--flush {
  padding-top: 0;
  border-top: none;
}

.sec__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.sec__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-1);
}

.sec__desc {
  margin: 4px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-3);
}

.sec__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
</style>
