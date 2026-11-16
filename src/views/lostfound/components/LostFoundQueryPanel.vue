<script setup>
import { ArrowRight, Connection, Plus, Search } from '@element-plus/icons-vue'

defineProps({
  categories: { type: Array, default: () => [] },
  results: { type: Array, default: () => [] },
  watches: { type: Array, default: () => [] },
  started: { type: Boolean, default: false },
  searching: { type: Boolean, default: false },
  watchSaving: { type: Boolean, default: false },
})

const query = defineModel('query', { type: Object, required: true })
const emit = defineEmits(['search', 'publish', 'watch', 'open', 'close', 'close-watch'])
</script>

<template>
  <section class="lost-query" aria-labelledby="lost-query-title">
    <div class="lost-query__intro">
      <span class="lost-query__eyebrow">
        <el-icon><Search /></el-icon>
        先查招领
      </span>
      <h2 id="lost-query-title">丢了东西，先看看有没有人已经捡到</h2>
      <p>查询不会发布帖子，也不会公开你的信息。找到疑似物品可直接认领；没有结果时再发布寻物启事。</p>
    </div>
    <div class="lost-query__form">
      <el-input
        v-model="query.item"
        size="large"
        clearable
        placeholder="物品名称，如：蓝色保温杯、校园卡"
        @keyup.enter="emit('search')"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <div class="lost-query__filters">
        <el-select v-model="query.category" placeholder="类别">
          <el-option
            v-for="cat in categories"
            :key="`query-${cat}`"
            :label="cat"
            :value="cat"
          />
        </el-select>
        <el-input v-model="query.color" clearable placeholder="颜色 / 品牌" />
        <el-input v-model="query.place" clearable placeholder="大致地点" />
      </div>
      <el-input
        v-model="query.description"
        clearable
        placeholder="可选：补充划痕、贴纸、挂件等独有特征"
      />
      <div class="lost-query__actions">
        <el-button type="primary" :loading="searching" @click="emit('search')">
          <el-icon><Search /></el-icon>
          查询招领信息
        </el-button>
        <span>只查询，不发布</span>
      </div>
    </div>

    <div v-if="started" class="lost-query__results">
      <div class="lost-query__result-head">
        <div>
          <b v-if="results.length">找到 {{ results.length }} 条可能相关的招领</b>
          <b v-else>暂未找到匹配的招领信息</b>
          <span v-if="results.length">按物品、类别、颜色与地点综合排序</span>
          <span v-else>可以先只让系统帮你留意，或按刚才填写的内容发布寻物启事。</span>
        </div>
        <button type="button" class="link-btn" @click="emit('close')">收起</button>
      </div>
      <div v-if="results.length" class="lost-query__grid">
        <button
          v-for="item in results"
          :key="item.post.id"
          type="button"
          class="lost-query-result"
          @click="emit('open', item.post)"
        >
          <span class="lost-query-result__score">{{ item.score }}% 匹配</span>
          <strong>{{ item.post.title }}</strong>
          <span>{{ item.post.place }} · {{ item.post.timeText }}</span>
          <small>{{ item.reasons.slice(0, 2).join(' · ') || '同类别候选' }}</small>
          <em>查看并认领 <el-icon><ArrowRight /></el-icon></em>
        </button>
      </div>
      <div v-else class="lost-query__empty-actions">
        <el-button type="primary" @click="emit('publish')">
          <el-icon><Plus /></el-icon>
          发布寻物启事并持续匹配
        </el-button>
        <el-button :loading="watchSaving" @click="emit('watch')">
          <el-icon><Connection /></el-icon>
          只帮我留意，不公开
        </el-button>
      </div>
    </div>

    <div v-if="watches.length" class="lost-query__watches">
      <div class="lost-query__watches-head">
        <span>
          正在为你留意
          {{ watches.filter((watch) => watch.status === 'active').length }} 组条件
        </span>
        <span class="t-xs faint">匹配到高可信招领时会发送站内通知</span>
      </div>
      <div
        v-for="watch in watches.filter((item) => item.status === 'active')"
        :key="watch.id"
        class="lost-query__watch-item"
      >
        <span>
          {{ watch.criteria.item || watch.criteria.description || '自定义特征' }}
          <template v-if="watch.criteria.color"> · {{ watch.criteria.color }}</template>
          <template v-if="watch.criteria.place"> · {{ watch.criteria.place }}</template>
        </span>
        <button type="button" class="link-btn" @click="emit('close-watch', watch.id)">
          停止留意
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lost-query {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(0, 1.28fr);
  gap: 24px;
  padding: 20px;
  border: 1px solid var(--brand-100);
  border-left: 3px solid var(--brand-500);
  background: var(--brand-50);
}

.lost-query__intro {
  align-self: start;
}

.lost-query__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--brand-700);
}

.lost-query__intro h2 {
  margin: 10px 0 0;
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 1.45;
  color: var(--text-1);
}

.lost-query__intro p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.lost-query__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.lost-query__filters {
  display: grid;
  grid-template-columns: 150px repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.lost-query__actions,
.lost-query__watches,
.lost-query__empty-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lost-query__actions > span,
.lost-query__result-head span,
.lost-query__watches {
  font-size: 12px;
  color: var(--text-3);
}

.lost-query__results,
.lost-query__watches {
  grid-column: 1 / -1;
}

.lost-query__results,
.lost-query__watches {
  padding-top: 16px;
  border-top: 1px solid var(--brand-100);
}

.lost-query__watches {
  padding-top: 12px;
  color: var(--text-2);
}

.lost-query__watches-head,
.lost-query__watch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.lost-query__watches-head {
  color: var(--text-2);
}

.lost-query__watch-item {
  padding: 6px 8px;
  border: 1px solid var(--brand-100);
  background: var(--surface-2);
}

.lost-query__result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.lost-query__result-head > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lost-query__result-head b {
  font-size: 14px;
  color: var(--text-1);
}

.lost-query__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.lost-query-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  text-align: left;
  color: var(--text-2);
  cursor: pointer;
}

.lost-query-result:hover {
  border-color: var(--brand-300);
  background: var(--surface-2);
}

.lost-query-result__score {
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--teal-50);
  color: var(--teal-700);
  font-size: 12px;
  font-weight: 700;
}

.lost-query-result strong {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-1);
}

.lost-query-result > span:not(.lost-query-result__score),
.lost-query-result small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.lost-query-result em {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-600);
}

.lost-query__empty-actions {
  margin-top: 12px;
}

@media (max-width: 900px) {
  .lost-query {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
}

@media (max-width: 640px) {
  .lost-query {
    padding: 16px;
  }

  .lost-query__filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .lost-query__intro h2 {
    font-size: 18px;
  }
}
</style>
