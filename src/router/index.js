import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: { title: 'AI 调度工作台', section: 'DASHBOARD' },
      },
      {
        path: 'classroom',
        name: 'classroom',
        component: () => import('@/views/classroom/ClassroomView.vue'),
        meta: { title: '教室借用', section: 'SCENE 01 · 资源匹配', module: 'classroom' },
      },
      {
        path: 'classroom/status',
        name: 'classroom-status',
        component: () => import('@/views/classroom/ApplicationStatusView.vue'),
        meta: { title: '我的申请', section: 'SCENE 01 · 进度跟踪', module: 'classroom' },
      },
      {
        path: 'classroom/status/:id',
        name: 'application-detail',
        component: () => import('@/views/classroom/ApplicationDetailView.vue'),
        meta: { title: '申请详情', section: 'SCENE 01 · 进度跟踪', module: 'classroom' },
      },
      {
        path: 'lostfound',
        name: 'lostfound',
        component: () => import('@/views/lostfound/LostFoundView.vue'),
        meta: { title: '失物招领广场', section: 'SCENE 02 · 双向匹配' },
      },
      {
        path: 'lostfound/publish',
        name: 'lostfound-publish',
        component: () => import('@/views/lostfound/PublishView.vue'),
        meta: { title: '发布失物 / 招领', section: 'SCENE 02 · AI 生成文案' },
      },
      {
        path: 'groupbuy',
        name: 'groupbuy',
        component: () => import('@/views/groupbuy/GroupBuyView.vue'),
        meta: { title: '拼单集市', section: 'SCENE 03 · 成团进度' },
      },
      {
        path: 'groupbuy/:id',
        name: 'groupbuy-detail',
        component: () => import('@/views/groupbuy/GroupBuyDetailView.vue'),
        meta: { title: '拼单详情', section: 'SCENE 03 · 成团进度' },
      },
      {
        path: 'forum',
        name: 'forum',
        component: () => import('@/views/forum/ForumView.vue'),
        meta: { title: '校园论坛', section: 'SCENE 04 · 同频讨论' },
      },
      {
        path: 'forum/:id',
        name: 'forum-detail',
        component: () => import('@/views/forum/ForumDetailView.vue'),
        meta: { title: '帖子详情', section: 'SCENE 04 · 同频讨论' },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/NotificationsView.vue'),
        meta: { title: '消息通知中心', section: 'INBOX' },
      },
      {
        path: 'ai-record',
        name: 'ai-record',
        component: () => import('@/views/AiRecordView.vue'),
        meta: { title: 'AI 使用记录', section: 'AI LOG' },
      },
      {
        path: 'system',
        name: 'system',
        component: () => import('@/views/SystemView.vue'),
        meta: { title: '系统控制台', section: 'SYSTEM', superOnly: true },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: '个人资料', section: 'ACCOUNT' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: { title: '页面走丢了', section: '404' },
      },
    ],
  },
]

export const router = createRouter({
  // 使用 Vite 注入的 BASE_URL：静态托管在子路径（如 GitHub Pages 项目页）时
  // 也能正确匹配路由；Node 一体化部署时 BASE_URL 为 '/'，行为不变。
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 84 }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const user = useUserStore()
  document.title = to.meta.title ? `${to.meta.title} · 校园智能调度平台` : '校园智能调度平台'

  if (user.token) {
    await user.restoreSession({ force: !user.authReady })
  } else {
    user.authReady = true
  }

  if (!to.meta.public && !user.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && user.isLoggedIn) {
    return { path: '/' }
  }
  if (to.meta.superOnly && !user.isSuperAdmin) {
    ElMessage.error('只有高级管理员可以访问权限管理')
    return { path: '/' }
  }
  if (to.meta.module && !user.canAccess(to.meta.module)) {
    ElMessage.warning('当前角色无权访问该功能')
    return { path: '/' }
  }
  return true
})

// 发布新版本后，停留在旧页面的用户点开懒加载路由可能拿到 404 的 chunk。
// 首次失败自动刷新一次；仍失败则给出明确提示，避免白屏。
const CHUNK_RELOAD_KEY = 'campus-smart-dispatch-platform:chunk-reloaded'
router.onError((error, to) => {
  const message = String(error?.message || error || '')
  const isChunkError = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(
    message,
  )
  if (!isChunkError) return

  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    ElMessage.error('页面资源加载失败，请刷新浏览器后重试')
    return
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  window.location.assign(to?.fullPath || '/')
})

export default router
