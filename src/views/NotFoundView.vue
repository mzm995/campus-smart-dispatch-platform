<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  HomeFilled,
  MagicStick,
  Position,
} from '@element-plus/icons-vue'
import AiBadge from '@/components/AiBadge.vue'
import SceneIcon from '@/components/SceneIcon.vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const requestPath = computed(() => {
  const path = route.fullPath || '/'
  return path.length > 42 ? `${path.slice(0, 42)}…` : path
})

const shortcuts = [
  {
    scene: 'classroom',
    title: '教室借用',
    desc: '找一间能开会、能投影的教室',
    to: '/classroom',
  },
  {
    scene: 'lostfound',
    title: '失物招领',
    desc: '丢了东西，让 AI 帮你找线索',
    to: '/lostfound',
  },
  {
    scene: 'groupbuy',
    title: '拼单广场',
    desc: '奶茶、水果，凑够人数就成团',
    to: '/groupbuy',
  },
  {
    scene: 'forum',
    title: '校园论坛',
    desc: '发帖求助，AI 帮你找同频讨论',
    to: '/forum',
  },
]

function goHome() {
  router.push('/')
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function askAi() {
  app.openAiDialog('我想找一间能开班会、带投影的教室')
}
</script>

<template>
  <div class="page nf">
    <section class="nf-hero">
      <div class="nf-inner">
        <div class="nf-eyebrow">
          <span class="dot dot--brand dot--pulse"></span>
          <span>404 · PAGE NOT FOUND</span>
          <AiBadge text="演示站点" ghost small />
        </div>

        <div class="nf-code" aria-hidden="true">404</div>
        <h1 class="nf-title">这条小路还没铺好</h1>
        <p class="nf-desc">
          你访问的页面可能已经挪窝、被删除，或者链接里少了一个字符。
          别担心，校园里的正事都可以从下面重新开始。
        </p>

        <div class="nf-path mono">
          <el-icon><Position /></el-icon>
          <span class="nf-path__label">请求路径</span>
          <span class="nf-path__value">{{ requestPath }}</span>
        </div>

        <div class="nf-actions">
          <el-button type="primary" size="large" @click="goHome">
            <el-icon><HomeFilled /></el-icon>
            返回首页
          </el-button>
          <el-button size="large" plain @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回上一页
          </el-button>
          <el-button size="large" text class="nf-ai-btn" @click="askAi">
            <el-icon><MagicStick /></el-icon>
            让 AI 帮我安排
          </el-button>
        </div>

        <div class="nf-foot">
          <span class="nf-foot__hint">也可以去</span>
          <router-link class="nf-foot__link" to="/notifications">
            <el-icon><Bell /></el-icon>
            消息通知中心
          </router-link>
          <span class="nf-foot__sep">·</span>
          <router-link class="nf-foot__link" to="/ai-record">AI 使用记录</router-link>
        </div>
      </div>

      <div class="nf-stamp mono" aria-hidden="true">校园智能调度平台</div>
    </section>

    <section class="nf-shortcuts">
      <div class="section-head">
        <div>
          <h2 class="section-head__title">你可能想找</h2>
          <p class="section-head__desc">四个高频场景，一句话就能开始，不用记菜单。</p>
        </div>
      </div>

      <div class="grid g4">
        <router-link
          v-for="item in shortcuts"
          :key="item.to"
          :to="item.to"
          class="card card--pad nf-link lift"
        >
          <SceneIcon :scene="item.scene" :size="42" />
          <div class="nf-link__body">
            <h3 class="nf-link__title">{{ item.title }}</h3>
            <p class="nf-link__desc">{{ item.desc }}</p>
          </div>
          <el-icon class="nf-link__arrow"><ArrowRight /></el-icon>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nf {
  gap: 32px;
}

/* ---------- 404：以字号与留白承担版面 ---------- */
.nf-hero {
  position: relative;
  overflow: visible;
  padding: 32px 0 32px;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  color: var(--text-1);
  background: transparent;
  isolation: auto;
}

.nf-inner {
  position: relative;
  max-width: 600px;
}

.nf-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.nf-code {
  margin: 24px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(80px, 11vw, 128px);
  font-weight: 500;
  line-height: 0.9;
  letter-spacing: -0.02em;
  color: var(--brand-600);
  user-select: none;
}

.nf-title {
  margin: 16px 0 8px;
  font-family: var(--font-serif);
  font-size: var(--fs-3xl);
  line-height: 1.3;
  letter-spacing: 0;
  font-weight: 600;
  color: var(--text-1);
}

.nf-desc {
  margin: 0;
  max-width: 56ch;
  font-size: var(--fs-base);
  line-height: 1.8;
  color: var(--text-2);
}

.nf-path {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin-top: 24px;
  padding: 4px 12px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-xs);
  color: var(--text-2);
}

.nf-path__label {
  color: var(--text-4);
  letter-spacing: 0.04em;
}

.nf-path__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nf-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

.nf-actions :deep(.el-button) {
  height: 40px;
  padding: 0 16px;
}

.nf-actions :deep(.el-button--primary) {
  box-shadow: none;
}

.nf-actions :deep(.el-button.is-plain) {
  color: var(--text-1);
  border-color: var(--line-strong);
  background: transparent;
}

.nf-actions :deep(.el-button.is-plain:hover) {
  color: var(--text-1);
  border-color: var(--text-3);
  background: var(--surface-2);
}

.nf-ai-btn {
  color: var(--brand-600);
}

.nf-ai-btn:hover {
  color: var(--brand-700);
}

.nf-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.nf-foot__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-weight: 500;
  transition: color var(--dur) var(--ease-out);
}

.nf-foot__link:hover {
  color: var(--brand-600);
}

.nf-foot__sep {
  color: var(--line-strong);
}

.nf-stamp {
  position: absolute;
  right: 0;
  bottom: 34px;
  font-size: var(--fs-xs);
  letter-spacing: 0.22em;
  color: var(--text-4);
  text-transform: uppercase;
  writing-mode: vertical-rl;
}

/* ---------- 快捷入口：两列错落的杂志节奏 ---------- */
.nf-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nf-shortcuts .section-head {
  margin: 0;
}

.nf-shortcuts .grid {
  grid-template-columns: 1.35fr 1fr;
}

.nf-shortcuts .nf-link:nth-child(4n + 1) {
  grid-column: span 2;
}

.nf-link {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  color: inherit;
  text-decoration: none;
  transition: background var(--dur) var(--ease-out);
}

.nf-link:hover {
  background: var(--surface-2);
}

.nf-link__body {
  min-width: 0;
  flex: 1;
}

.nf-link__title {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-1);
}

.nf-link__desc {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.nf-link__arrow {
  flex: none;
  color: var(--text-4);
  transition: transform var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}

.nf-link:hover .nf-link__arrow {
  transform: translateX(3px);
  color: var(--brand-600);
}

@media (max-width: 900px) {
  .nf-stamp {
    display: none;
  }
}

@media (max-width: 640px) {
  .nf-hero {
    padding: 16px 0 24px;
  }

  .nf-code {
    font-size: clamp(72px, 24vw, 104px);
    margin-top: 16px;
  }

  .nf-title {
    font-size: var(--fs-2xl);
  }

  .nf-desc {
    font-size: var(--fs-sm);
    line-height: 1.8;
  }

  .nf-path {
    width: 100%;
  }

  .nf-path__label {
    display: none;
  }

  .nf-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .nf-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .nf-foot {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .nf-shortcuts .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .nf-shortcuts .nf-link:nth-child(4n + 1) {
    grid-column: auto;
  }

  .nf-link {
    padding: 16px 0;
  }
}
</style>
