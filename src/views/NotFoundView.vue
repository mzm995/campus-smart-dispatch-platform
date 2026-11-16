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
      <div class="nf-grid" aria-hidden="true"></div>
      <div class="nf-orb nf-orb--a" aria-hidden="true"></div>
      <div class="nf-orb nf-orb--b" aria-hidden="true"></div>

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
  gap: 18px;
}

/* ---------- 品牌 404 hero ---------- */
.nf-hero {
  position: relative;
  overflow: hidden;
  border-radius: 26px;
  padding: 58px 56px 42px;
  color: #fff;
  background:
    radial-gradient(900px 520px at 82% 12%, rgba(124, 108, 255, 0.42), transparent 62%),
    radial-gradient(700px 500px at 6% 100%, rgba(18, 179, 166, 0.22), transparent 60%),
    linear-gradient(145deg, #2c2866 0%, #191c3c 52%, #0e1023 100%);
  box-shadow: var(--shadow-lg);
  isolation: isolate;
}

.nf-grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(circle at 62% 36%, #000 18%, transparent 76%);
  -webkit-mask-image: radial-gradient(circle at 62% 36%, #000 18%, transparent 76%);
}

.nf-orb {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  filter: blur(2px);
  pointer-events: none;
}

.nf-orb--a {
  width: 300px;
  height: 300px;
  right: -70px;
  top: -90px;
  background: radial-gradient(circle at 34% 34%, rgba(255, 255, 255, 0.5), rgba(124, 108, 255, 0.1) 45%, transparent 68%);
  opacity: 0.55;
}

.nf-orb--b {
  width: 200px;
  height: 200px;
  left: 42%;
  bottom: -120px;
  background: radial-gradient(circle, rgba(18, 179, 166, 0.5), transparent 68%);
  opacity: 0.4;
}

.nf-inner {
  position: relative;
  max-width: 660px;
}

.nf-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.72);
}

.nf-code {
  margin: 14px 0 4px;
  font-size: clamp(104px, 17vw, 196px);
  font-weight: 850;
  line-height: 0.84;
  letter-spacing: -0.07em;
  background: linear-gradient(118deg, #ffffff 6%, #d9d3ff 42%, #7d70ff 96%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 18px 44px rgba(108, 99, 255, 0.35));
  user-select: none;
}

.nf-title {
  margin: 18px 0 10px;
  font-size: clamp(26px, 3.4vw, 38px);
  line-height: 1.18;
  letter-spacing: -0.02em;
  font-weight: 770;
  color: #fff;
}

.nf-desc {
  margin: 0;
  max-width: 520px;
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.64);
}

.nf-path {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  margin-top: 22px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.07);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.nf-path__label {
  color: rgba(255, 255, 255, 0.42);
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
  gap: 12px;
  margin-top: 26px;
}

.nf-actions :deep(.el-button) {
  height: 42px;
  padding: 0 20px;
}

.nf-actions :deep(.el-button--primary) {
  box-shadow: 0 12px 26px rgba(108, 99, 255, 0.4);
}

.nf-actions :deep(.el-button.is-plain) {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.26);
  background: rgba(255, 255, 255, 0.06);
}

.nf-actions :deep(.el-button.is-plain:hover) {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
}

.nf-ai-btn {
  color: rgba(255, 255, 255, 0.78);
}

.nf-ai-btn:hover {
  color: #fff;
}

.nf-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.46);
}

.nf-foot__link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgba(255, 255, 255, 0.78);
  font-weight: 600;
  transition: color var(--dur) var(--ease-out);
}

.nf-foot__link:hover {
  color: #fff;
}

.nf-foot__sep {
  color: rgba(255, 255, 255, 0.26);
}

.nf-stamp {
  position: absolute;
  right: 34px;
  bottom: 26px;
  font-size: 10.5px;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.22);
  text-transform: uppercase;
}

/* ---------- 快捷入口 ---------- */
.nf-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.nf-shortcuts .section-head {
  margin: 0 2px;
}

.nf-link {
  display: flex;
  align-items: center;
  gap: 14px;
  color: inherit;
  text-decoration: none;
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out);
}

.nf-link:hover {
  transform: translateY(-2px);
  border-color: var(--brand-200);
  box-shadow: var(--shadow-md);
}

.nf-link__body {
  min-width: 0;
  flex: 1;
}

.nf-link__title {
  margin: 0 0 3px;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-1);
}

.nf-link__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
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
  color: var(--brand-500);
}

@media (max-width: 900px) {
  .nf-hero {
    padding: 44px 34px 34px;
    border-radius: 22px;
  }

  .nf-stamp {
    display: none;
  }
}

@media (max-width: 640px) {
  .nf-hero {
    padding: 30px 20px 26px;
    border-radius: var(--radius-lg);
  }

  .nf-code {
    font-size: clamp(96px, 30vw, 136px);
    margin-top: 8px;
  }

  .nf-title {
    margin-top: 14px;
  }

  .nf-desc {
    font-size: 13.5px;
    line-height: 1.8;
  }

  .nf-path {
    display: flex;
    width: 100%;
    border-radius: var(--radius);
  }

  .nf-path__label {
    display: none;
  }

  .nf-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-top: 22px;
  }

  .nf-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .nf-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .nf-foot {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .nf-link {
    padding: 16px;
  }

  .nf-link__desc {
    -webkit-line-clamp: 1;
  }
}
</style>
