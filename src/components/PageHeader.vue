<script setup>
defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
})
</script>

<template>
  <header class="page-head">
    <div class="page-head__main">
      <div v-if="eyebrow" class="page-head__eyebrow">
        <span class="dot dot--brand"></span>{{ eyebrow }}
      </div>
      <h1 class="page-head__title">{{ title }}</h1>
      <p v-if="desc" class="page-head__desc">{{ desc }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.page-head__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--fs-xs);
  font-weight: 650;
  letter-spacing: 0.12em;
  color: var(--text-3);
  text-transform: uppercase;
}

.page-head__title {
  margin: 0;
  font-size: clamp(22px, 2.4vw, 30px);
  font-weight: 760;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: var(--text-1);
}

.page-head__desc {
  margin: 8px 0 0;
  max-width: 640px;
  font-size: var(--fs-base);
  line-height: 1.65;
  color: var(--text-2);
}

.page-head__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .page-head {
    align-items: flex-start;
  }

  .page-head__actions {
    width: 100%;
  }
}
</style>
