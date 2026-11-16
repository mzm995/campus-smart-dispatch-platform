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
      <div v-if="eyebrow" class="page-head__eyebrow">{{ eyebrow }}</div>
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
  gap: 24px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.page-head__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.page-head__eyebrow::before {
  content: '';
  width: 24px;
  height: 1px;
  background: var(--line-strong);
}

.page-head__title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--fs-3xl);
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.3;
  color: var(--text-1);
}

.page-head__desc {
  margin: 8px 0 0;
  max-width: 62ch;
  font-size: var(--fs-base);
  line-height: 1.6;
  color: var(--text-2);
}

.page-head__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .page-head {
    align-items: flex-start;
  }

  .page-head__title {
    font-size: var(--fs-2xl);
  }

  .page-head__actions {
    width: 100%;
  }
}
</style>
