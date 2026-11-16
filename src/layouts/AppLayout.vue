<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  Bell,
  Calendar,
  ChatDotRound,
  Document,
  Expand,
  Fold,
  HomeFilled,
  InfoFilled,
  MagicStick,
  Menu,
  Reading,
  School,
  Search,
  ShoppingCart,
  SwitchButton,
  User,
  WarningFilled,
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { timeAgo } from '@/utils/format'
import {
  cloudConflicts,
  cloudSyncSummary,
  recoverConflictBackup,
  resolveCloudConflict,
} from '@/utils/cloudSync'
import AppSidebar from '@/components/AppSidebar.vue'
import AiParseDialog from '@/components/AiParseDialog.vue'
import DemoGuideDrawer from '@/components/DemoGuideDrawer.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useAvatarDirectoryStore } from '@/stores/avatar'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const user = useUserStore()
const notify = useNotifyStore()
const avatars = useAvatarDirectoryStore()

const previewOpen = ref(false)
const drawer = ref(false)
const demoGuideOpen = ref(false)
const resolvingConflict = ref(false)

const collapsed = computed(() => app.sidebarCollapsed)
const pageSection = computed(() => route.meta.section || '校园智能调度平台')
const previews = computed(() => notify.items.slice(0, 4))
const activeConflict = computed(() => cloudConflicts[0] || null)

const tabs = computed(() => [
  { title: '首页', path: '/', icon: HomeFilled, exact: true },
  ...(user.canAccess('classroom')
    ? [{ title: '教室', path: '/classroom', icon: School, exact: true }]
    : []),
  { title: '失物', path: '/lostfound', icon: Search },
  { title: '拼单', path: '/groupbuy', icon: ShoppingCart },
  { title: '论坛', path: '/forum', icon: ChatDotRound },
])

function openAi(text = '') {
  app.openAiDialog(text)
  drawer.value = false
}

function isTabActive(tab) {
  if (tab.exact) return route.path === tab.path
  return route.path === tab.path || route.path.startsWith(`${tab.path}/`)
}

function toNotice() {
  previewOpen.value = false
  router.push('/notifications')
}

function openNotice(item) {
  notify.markRead(item.id)
  previewOpen.value = false
  if (item.link) router.push(item.link)
  else router.push('/notifications')
}

async function onCommand(command) {
  if (command === 'demo-guide') {
    demoGuideOpen.value = true
  } else if (command === 'logout') {
    await user.logout()
    router.push('/login')
  } else {
    router.push(command)
  }
}

async function resolveConflict(action) {
  if (!activeConflict.value || resolvingConflict.value) return
  resolvingConflict.value = true
  try {
    await resolveCloudConflict(activeConflict.value.resource, action)
  } finally {
    resolvingConflict.value = false
  }
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openAi()
  }
}

watch(
  () => route.fullPath,
  () => {
    drawer.value = false
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  avatars.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  avatars.stop()
})
</script>

<template>
  <div class="shell" :class="{ 'is-collapsed': collapsed }">
    <a class="skip-link" href="#main">跳到主要内容</a>
    <div class="shell__aside only-desktop">
      <AppSidebar :collapsed="collapsed" @ai="openAi()" />
    </div>

    <div class="shell__main">
      <header class="topbar">
        <div class="topbar__left">
          <button
            class="icon-btn only-desktop"
            type="button"
            :title="collapsed ? '展开侧栏' : '收起侧栏'"
            :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
            :aria-expanded="!collapsed"
            @click="app.toggleSidebar()"
          >
            <el-icon :size="18"><component :is="collapsed ? Expand : Fold" /></el-icon>
          </button>
          <button
            class="icon-btn only-mobile"
            type="button"
            title="打开菜单"
            aria-label="打开导航菜单"
            @click="drawer = true"
          >
            <el-icon :size="19"><Menu /></el-icon>
          </button>
          <div class="topbar__title">
            <span class="topbar__section">{{ pageSection }}</span>
          </div>
        </div>

        <div class="topbar__actions">
          <button
            class="demo-trigger only-desktop"
            type="button"
            aria-label="打开评审演示向导"
            @click="demoGuideOpen = true"
          >
            <el-icon><Reading /></el-icon>
            评审向导
          </button>
          <span
            class="cloud-state only-desktop"
            :class="{ 'is-error': cloudSyncSummary.failed > 0 }"
            :title="
              cloudSyncSummary.failed
                ? '部分共享数据同步失败，将自动重试'
                : '业务数据已启用云端共享同步'
            "
          >
            <i></i>
            云端 {{ cloudSyncSummary.synced }}/{{ cloudSyncSummary.total }}
            <template v-if="cloudSyncSummary.conflicts"> · 冲突 {{ cloudSyncSummary.conflicts }}</template>
            <template v-else-if="cloudSyncSummary.pending"> · 待同步 {{ cloudSyncSummary.pending }}</template>
          </span>
          <button class="ai-trigger" type="button" aria-label="打开一句话调度输入框" @click="openAi()">
            <span class="ai-trigger__orb"><el-icon :size="14"><MagicStick /></el-icon></span>
            <span class="ai-trigger__text">一句话调度</span>
            <kbd class="ai-trigger__kbd">⌘K</kbd>
          </button>

          <el-popover v-model:visible="previewOpen" placement="bottom-end" :width="340" trigger="click" popper-class="notice-pop">
            <template #reference>
              <button
                class="icon-btn icon-btn--badge"
                type="button"
                title="消息通知"
                aria-label="消息通知"
                @click.prevent
              >
                <el-icon :size="18"><Bell /></el-icon>
                <span v-if="notify.unreadCount" class="icon-btn__badge">{{ notify.unreadCount > 99 ? '99+' : notify.unreadCount }}</span>
              </button>
            </template>
            <div class="np">
              <div class="np__head">
                <div>
                  <div class="np__title">消息通知</div>
                  <div class="np__sub">{{ notify.unreadCount }} 条未读 · {{ notify.importantUnread }} 条重要</div>
                </div>
                <el-button text size="small" @click="notify.markAllRead">全部已读</el-button>
              </div>
              <div v-if="previews.length" class="np__list">
                <button v-for="item in previews" :key="item.id" type="button" class="np__item" :class="{ 'is-unread': !item.read }" @click="openNotice(item)">
                  <span class="np__dot" :class="item.important ? 'is-important' : ''"></span>
                  <span class="np__body">
                    <span class="np__item-title">{{ item.title }}</span>
                    <span class="np__item-time">{{ timeAgo(item.time) }}</span>
                  </span>
                </button>
              </div>
              <div v-else class="np__empty">暂时没有新消息</div>
              <div class="np__foot">
                <el-button text size="small" @click="toNotice">查看全部通知 →</el-button>
              </div>
            </div>
          </el-popover>

          <el-dropdown trigger="click" @command="onCommand">
            <button class="user-chip" type="button" aria-label="账号菜单">
              <UserAvatar
                class="user-chip__avatar"
                :name="user.user?.name || '游客'"
                :user-id="user.user?.id"
                :src="user.user?.avatarUrl"
                :size="30"
              />
              <span class="user-chip__meta only-desktop">
                <span class="user-chip__name">{{ user.user?.name || '未登录' }}</span>
                <span class="user-chip__role">{{ user.user?.role || '游客' }}</span>
              </span>
              <el-icon class="only-desktop" :size="12"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="/profile" :icon="User">个人资料</el-dropdown-item>
                <el-dropdown-item command="demo-guide" :icon="Reading">评审演示向导</el-dropdown-item>
                <el-dropdown-item v-if="user.canAccess('classroom')" command="/classroom/status" :icon="Document">我的申请</el-dropdown-item>
                <el-dropdown-item command="/notifications" :icon="ChatDotRound">消息通知</el-dropdown-item>
                <el-dropdown-item divided command="logout" :icon="SwitchButton">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div v-if="user.backendUnavailable" class="backend-offline" role="status">
        <el-icon><WarningFilled /></el-icon>
        <div>
          <strong>后端连接暂时中断，正在使用本地缓存</strong>
          <span>{{ user.backendError }}。你的登录状态和业务数据不会被清空。</span>
        </div>
        <el-button size="small" :loading="user.restoring" @click="user.retrySession">
          重新连接
        </el-button>
      </div>

      <main id="main" class="content" tabindex="-1">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </main>
    </div>

    <nav class="tabbar only-mobile">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        type="button"
        class="tabbar__item"
        :class="{ 'is-active': isTabActive(tab) }"
        @click="router.push(tab.path)"
      >
        <span class="tabbar__icon">
          <el-icon :size="20"><component :is="tab.icon" /></el-icon>
          <span v-if="tab.badge && notify.unreadCount" class="tabbar__badge"></span>
        </span>
        <span class="tabbar__label">{{ tab.title }}</span>
      </button>
      <button type="button" class="tabbar__item tabbar__ai" @click="openAi()">
        <span class="tabbar__icon tabbar__ai-orb"><el-icon :size="19"><MagicStick /></el-icon></span>
        <span class="tabbar__label">AI</span>
      </button>
    </nav>

    <el-drawer v-model="drawer" direction="ltr" size="80%" :with-header="false" class="nav-drawer">
      <AppSidebar mobile @navigate="drawer = false" @ai="openAi()" />
    </el-drawer>

    <AiParseDialog />
    <DemoGuideDrawer v-model="demoGuideOpen" />

    <el-dialog
      :model-value="Boolean(activeConflict)"
      width="min(560px, 92vw)"
      align-center
      append-to-body
      :close-on-click-modal="false"
      :show-close="false"
      title="检测到云端同步冲突"
    >
      <div v-if="activeConflict" class="conflict-dialog">
        <div class="conflict-dialog__head">
          <span><el-icon><WarningFilled /></el-icon></span>
          <div>
            <strong>{{ activeConflict.label }}存在两个不同版本</strong>
            <p>系统没有自动覆盖本地数据。你可以保留本地、采用云端，或按记录 ID 自动合并。</p>
          </div>
        </div>
        <div class="conflict-dialog__meta">
          <span>检测时间：{{ timeAgo(activeConflict.detectedAt) }}</span>
          <span>本地冲突副本已单独保存</span>
        </div>
        <div class="notice notice--amber">
          <el-icon><InfoFilled /></el-icon>
          <span>“自动合并”会按记录 ID 合并，论坛回复、失物线索、拼单成员等列表会取双方并集。</span>
        </div>
        <div class="conflict-dialog__backup">
          <el-button text @click="recoverConflictBackup(activeConflict.resource)">
            另存本地冲突副本
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button :disabled="resolvingConflict" @click="resolveConflict('local')">
          保留本地
        </el-button>
        <el-button :disabled="resolvingConflict" @click="resolveConflict('merge')">
          自动合并
        </el-button>
        <el-button type="primary" :disabled="resolvingConflict" @click="resolveConflict('cloud')">
          使用云端
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.shell {
  --side-w: var(--sidebar-w);
  min-height: 100vh;
  background: var(--bg);
}

.skip-link {
  position: fixed;
  top: 10px;
  left: 12px;
  z-index: 999;
  padding: 9px 16px;
  border-radius: 10px;
  background: var(--brand-600);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-md);
  transform: translateY(-160%);
  transition: transform 0.18s ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.shell.is-collapsed {
  --side-w: var(--sidebar-w-collapsed);
}

.shell__aside {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--side-w);
  z-index: var(--z-sidebar);
  transition: width var(--dur) var(--ease-out);
}

.shell__main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin-left: var(--side-w);
  transition: margin-left var(--dur) var(--ease-out);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-topbar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  height: var(--topbar-h);
  padding: 0 26px;
  background: rgba(250, 251, 255, 0.82);
  backdrop-filter: blur(16px) saturate(1.5);
  border-bottom: 1px solid var(--line);
}

.topbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.topbar__title {
  min-width: 0;
  line-height: 1.2;
}

.topbar__section {
  display: block;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.1em;
  color: var(--text-2);
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.demo-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--brand-100);
  border-radius: 10px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 10.5px;
  font-weight: 650;
  cursor: pointer;
}

.demo-trigger:hover {
  border-color: var(--brand-300);
  background: var(--surface);
}

.cloud-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--teal-100);
  border-radius: var(--radius-pill);
  background: var(--teal-50);
  color: var(--teal-600);
  font-size: 10.5px;
  font-weight: 650;
  white-space: nowrap;
}

.cloud-state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--teal-500);
  box-shadow: 0 0 0 3px rgba(18, 179, 166, 0.12);
}

.cloud-state.is-error {
  border-color: var(--coral-100);
  background: var(--coral-50);
  color: var(--coral-600);
}

.cloud-state.is-error i {
  background: var(--coral-500);
}

.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  transition: all var(--dur) var(--ease-out);
  flex: none;
}

.icon-btn:hover {
  color: var(--brand-600);
  border-color: var(--brand-200);
  background: var(--brand-50);
}

.icon-btn__badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--coral-500);
  border: 2px solid #fafbff;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

.ai-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 8px 0 6px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--brand-100);
  background: linear-gradient(120deg, #fff, #f5f3ff);
  color: var(--brand-700);
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 650;
  cursor: pointer;
  transition: all var(--dur) var(--ease-out);
}

.ai-trigger:hover {
  border-color: var(--brand-300);
  box-shadow: 0 8px 20px -12px rgba(108, 99, 255, 0.8);
  transform: translateY(-1px);
}

.ai-trigger__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
}

.ai-trigger__kbd {
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(108, 99, 255, 0.08);
  border: 1px solid rgba(108, 99, 255, 0.12);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--brand-600);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px 0 5px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--surface);
  cursor: pointer;
  transition: all var(--dur);
  font-family: inherit;
}

.user-chip:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-sm);
}

.user-chip__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  flex: none;
}

.user-chip__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-chip__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  text-align: left;
}

.user-chip__name {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-1);
}

.user-chip__role {
  margin-top: 2px;
  font-size: 10px;
  color: var(--text-3);
}

.backend-offline {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px var(--space-page, 24px) 0;
  padding: 10px 14px;
  border: 1px solid rgba(245, 166, 35, 0.28);
  border-radius: 12px;
  color: var(--amber-700);
  background: var(--amber-50);
}

.backend-offline > .el-icon {
  flex: none;
  font-size: 17px;
}

.backend-offline > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.backend-offline strong {
  font-size: 11.5px;
}

.backend-offline span {
  font-size: 10.5px;
  color: var(--text-3);
}

.conflict-dialog {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.conflict-dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.conflict-dialog__head > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: var(--amber-600);
  background: var(--amber-50);
  font-size: 18px;
}

.conflict-dialog__head > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conflict-dialog__head strong {
  font-size: 13px;
  color: var(--text-1);
}

.conflict-dialog__head p {
  margin: 0;
  font-size: 11px;
  line-height: 1.65;
  color: var(--text-3);
}

.conflict-dialog__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 10px;
  color: var(--text-3);
}

.conflict-dialog .notice {
  margin: 0;
  align-items: flex-start;
}

.conflict-dialog__backup {
  display: flex;
  justify-content: flex-end;
}

.content {
  flex: 1;
  padding: 26px 28px 40px;
  width: 100%;
}

/* 通知预览 */
.np__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.np__title {
  font-size: var(--fs-base);
  font-weight: 700;
  color: var(--text-1);
}

.np__sub {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-3);
}

.np__list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow-y: auto;
}

.np__item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 10px 4px;
  border: none;
  border-bottom: 1px dashed var(--line);
  background: none;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dur);
}

.np__item:hover {
  background: var(--surface-2);
}

.np__dot {
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--line-strong);
  flex: none;
}

.np__dot.is-important {
  background: var(--coral-500);
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.16);
}

.np__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.np__item-title {
  font-size: 12px;
  font-weight: 550;
  line-height: 1.5;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.np__item.is-unread .np__item-title {
  font-weight: 650;
  color: var(--text-1);
}

.np__item-time {
  font-size: 10px;
  color: var(--text-4);
}

.np__empty {
  padding: 22px 0;
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.np__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

/* 移动端底部导航 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-tabbar);
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  height: calc(var(--mobile-tabbar-h) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--line);
}

.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  border: none;
  background: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: color var(--dur);
}

.tabbar__icon {
  position: relative;
  display: inline-flex;
}

.tabbar__label {
  font-weight: 600;
}

.tabbar__item.is-active {
  color: var(--brand-600);
}

.tabbar__badge {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--coral-500);
  border: 1.5px solid #fff;
}

.tabbar__ai .tabbar__ai-orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  margin-top: -14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
  box-shadow: 0 10px 20px -8px rgba(108, 99, 255, 0.9);
  border: 3px solid #fff;
}

.tabbar__ai .tabbar__label {
  color: var(--brand-600);
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s var(--ease-out), transform 0.22s var(--ease-out);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 900px) {
  .shell__main {
    margin-left: 0;
  }

  .topbar {
    padding: 0 14px;
  }

  .content {
    padding: 16px 14px calc(var(--mobile-tabbar-h) + 28px);
  }

  .ai-trigger__text,
  .ai-trigger__kbd {
    display: none;
  }

  .ai-trigger {
    width: 38px;
    padding: 0;
    justify-content: center;
  }

  .user-chip {
    padding: 0 5px;
    border: none;
    background: transparent;
  }
}
</style>

<style>
.notice-pop.el-popover {
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
</style>
