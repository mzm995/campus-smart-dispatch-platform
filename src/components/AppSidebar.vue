<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  Bell,
  ChatDotRound,
  Document,
  HomeFilled,
  MagicStick,
  School,
  Search,
  Setting,
  ShoppingCart,
  SwitchButton,
} from '@element-plus/icons-vue'
import AppLogo from './AppLogo.vue'
import UserAvatar from './UserAvatar.vue'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { useClassroomStore } from '@/stores/classroom'
import { useForumStore } from '@/stores/forum'
import { CAMPUS } from '@/mock/campus'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  mobile: { type: Boolean, default: false },
})
const emit = defineEmits(['navigate'])

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const notify = useNotifyStore()
const classroom = useClassroomStore()
const forum = useForumStore()

const groups = computed(() => [
  {
    label: '工作台',
    items: [{ title: '首页', path: '/', icon: HomeFilled, exact: true }],
  },
  {
    label: '四大场景',
    items: [
      ...(user.canAccess('classroom')
        ? [{ title: '教室借用', path: '/classroom', icon: School, exact: true }]
        : []),
      { title: '失物招领', path: '/lostfound', icon: Search, count: 0 },
      { title: '拼单集市', path: '/groupbuy', icon: ShoppingCart },
      { title: '校园论坛', path: '/forum', icon: ChatDotRound, count: forum.stats.pending, tone: 'coral' },
    ],
  },
  {
    label: '记录与设置',
    items: [
      { title: '消息通知', path: '/notifications', icon: Bell, count: notify.unreadCount },
      ...(user.canAccess('classroom')
        ? [{ title: '我的申请', path: '/classroom/status', icon: Document, count: classroom.stats.pending, tone: 'amber' }]
        : []),
      { title: 'AI 使用记录', path: '/ai-record', icon: MagicStick },
      ...(user.isSuperAdmin ? [{ title: '系统控制台', path: '/system', icon: Setting }] : []),
    ],
  },
])

function isActive(item) {
  if (props.collapsed && !props.mobile) return route.path === item.path
  if (item.exact) return route.path === item.path
  if (item.path === '/') return route.path === '/'
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

function go(item) {
  router.push(item.path)
  emit('navigate')
}

async function logout() {
  try {
    await ElMessageBox.confirm('退出后本地演示数据仍会保留，下次登录可继续。确定退出吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '再想想',
      type: 'warning',
    })
  } catch {
    return
  }
  await user.logout()
  emit('navigate')
  router.push('/login')
}
</script>

<template>
  <aside class="side" :class="{ 'side--collapsed': collapsed && !mobile, 'side--mobile': mobile }">
    <div class="side__brand">
      <AppLogo :size="collapsed && !mobile ? 32 : 36" :show-text="!collapsed || mobile" />
    </div>

    <nav class="side__nav">
      <div v-for="group in groups" :key="group.label" class="side__group">
        <div v-if="!collapsed || mobile" class="side__group-label">{{ group.label }}</div>
        <div v-else class="side__group-line"></div>
        <button
          v-for="item in group.items"
          :key="item.path"
          type="button"
          class="side__item"
          :class="{ 'is-active': isActive(item) }"
          :title="collapsed && !mobile ? item.title : ''"
          @click="go(item)"
        >
          <span class="side__icon"><el-icon :size="18"><component :is="item.icon" /></el-icon></span>
          <span v-if="!collapsed || mobile" class="side__label">{{ item.title }}</span>
          <span v-if="item.count > 0 && (!collapsed || mobile)" class="side__count" :class="`side__count--${item.tone || 'brand'}`">
            {{ item.count > 99 ? '99+' : item.count }}
          </span>
          <span v-else-if="item.count > 0" class="side__dot" :class="`side__dot--${item.tone || 'brand'}`"></span>
        </button>
      </div>
    </nav>

    <div class="side__foot">
      <button v-if="!collapsed || mobile" type="button" class="side__ai" @click="$emit('ai')">
        <span class="side__ai-orb"><el-icon :size="15"><MagicStick /></el-icon></span>
        <span class="grow">
          <strong>一句话调度</strong>
          <small>让 AI 帮你安排</small>
        </span>
        <span class="side__ai-arrow">→</span>
      </button>
      <p v-if="!collapsed || mobile" class="side__campus">{{ CAMPUS.campus }} · 郑上路 776 号</p>
      <div class="side__user">
        <UserAvatar
          class="side__avatar"
          :name="user.user?.name || '游客'"
          :user-id="user.user?.id"
          :src="user.user?.avatarUrl"
          :size="30"
          :radius="4"
        />
        <div v-if="!collapsed || mobile" class="side__user-info">
          <div class="side__user-name">{{ user.user?.name || '未登录' }}</div>
          <div class="side__user-meta">{{ user.maskedNo }} · {{ user.user?.role }}</div>
        </div>
        <button v-if="!collapsed || mobile" type="button" class="side__logout" title="退出登录" @click="logout">
          <el-icon :size="15"><SwitchButton /></el-icon>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side {
  position: relative;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  height: 100%;
  padding: 24px 16px 16px;
  color: var(--text-2);
  background: var(--bg);
  border-right: 1px solid var(--line);
  transition: width var(--dur) var(--ease-out);
  overflow: hidden;
}

.side--collapsed {
  width: var(--sidebar-w-collapsed);
  padding-left: 8px;
  padding-right: 8px;
}

.side--mobile {
  width: 100%;
  border-right: none;
  background: var(--surface);
}

.side__brand {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 8px;
  margin-bottom: 32px;
}

.side--collapsed .side__brand {
  padding: 0;
  justify-content: center;
}

.side__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 24px;
  scrollbar-width: none;
}

.side__nav::-webkit-scrollbar {
  display: none;
}

.side__group {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.side__group-label {
  padding: 0 8px 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-4);
}

.side__group-line {
  height: 1px;
  margin: 4px 8px 8px;
  background: var(--line);
}

.side__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: var(--fs-base);
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
  text-align: left;
}

.side--collapsed .side__item {
  justify-content: center;
  padding: 0;
}

.side__item:hover {
  background: var(--surface-3);
  color: var(--text-1);
}

/* 选中态：浅钢蓝底 + 左侧 2px 实色竖条 */
.side__item.is-active {
  background: var(--brand-50);
  color: var(--brand-700);
  font-weight: 600;
}

.side__item.is-active::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 2px;
  height: 16px;
  background: var(--brand-600);
  transform: translateY(-50%);
}

.side--collapsed .side__item.is-active::before {
  left: -8px;
}

.side__icon {
  display: inline-flex;
  flex: none;
}

.side__item.is-active .side__icon {
  color: var(--brand-600);
}

.side__label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-3);
  font-size: var(--fs-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.side__count--brand {
  background: var(--brand-100);
  color: var(--brand-700);
}

.side__count--amber {
  background: var(--amber-100);
  color: var(--amber-700);
}

.side__count--coral {
  background: var(--coral-100);
  color: var(--coral-700);
}

.side__dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--coral-500);
  box-shadow: 0 0 0 2px var(--brand-50);
}

.side__dot--amber {
  background: var(--amber-500);
}

.side__dot--brand {
  background: var(--brand-500);
}

.side__foot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
}

.side__ai {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-1);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.side__ai:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
}

.side__ai-orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--brand-600);
  color: var(--text-invert);
  flex: none;
}

.side__ai strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.side__ai small {
  display: block;
  margin-top: 0px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.side__ai-arrow {
  font-size: var(--fs-base);
  color: var(--text-4);
}

.side__campus {
  margin: 0 4px;
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
  color: var(--text-4);
}

.side__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.side--collapsed .side__user {
  justify-content: center;
  padding-top: 12px;
}

.side__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  overflow: hidden;
  color: var(--text-invert);
  font-size: var(--fs-xs);
  font-weight: 600;
  flex: none;
}

.side__user-info {
  flex: 1;
  min-width: 0;
}

.side__user-name {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side__user-meta {
  margin-top: 0px;
  font-size: var(--fs-xs);
  color: var(--text-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.side__logout:hover {
  background: var(--surface-3);
  color: var(--text-1);
}
</style>
