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
      <AppLogo :size="collapsed && !mobile ? 34 : 36" :show-text="!collapsed || mobile" :light="true" />
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
          :size="32"
          :radius="11"
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
  padding: 20px 14px 16px;
  color: rgba(255, 255, 255, 0.72);
  background: radial-gradient(520px 320px at 0% 0%, rgba(108, 99, 255, 0.28), transparent 60%),
    radial-gradient(420px 300px at 100% 100%, rgba(18, 179, 166, 0.18), transparent 60%),
    linear-gradient(180deg, #12152b 0%, #141830 55%, #101423 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width var(--dur) var(--ease-out);
  overflow: hidden;
}

.side--collapsed {
  width: var(--sidebar-w-collapsed);
  padding-left: 10px;
  padding-right: 10px;
}

.side--mobile {
  width: 100%;
  border-right: none;
}

.side__brand {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  margin-bottom: 22px;
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
  gap: 18px;
  scrollbar-width: none;
}

.side__nav::-webkit-scrollbar {
  display: none;
}

.side__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side__group-label {
  padding: 0 10px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.34);
  text-transform: uppercase;
}

.side__group-line {
  height: 1px;
  margin: 4px 8px 8px;
  background: rgba(255, 255, 255, 0.08);
}

.side__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  height: 42px;
  padding: 0 11px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.66);
  font-family: inherit;
  font-size: var(--fs-base);
  font-weight: 550;
  cursor: pointer;
  transition: all var(--dur) var(--ease-out);
  text-align: left;
}

.side--collapsed .side__item {
  justify-content: center;
  padding: 0;
}

.side__item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}

.side__item.is-active {
  background: linear-gradient(135deg, rgba(108, 99, 255, 0.95), rgba(124, 108, 255, 0.8));
  color: #fff;
  box-shadow: 0 12px 24px -14px rgba(108, 99, 255, 0.95);
}

.side__item.is-active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: #a79fff;
  transform: translateY(-50%);
}

.side--collapsed .side__item.is-active::before {
  left: -10px;
}

.side__icon {
  display: inline-flex;
  flex: none;
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
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: rgba(108, 99, 255, 0.9);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.side__count--amber {
  background: var(--amber-500);
  color: #3a2705;
}

.side__count--coral {
  background: var(--coral-500);
}

.side__dot {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--coral-500);
  box-shadow: 0 0 0 2px #141830;
}

.side__dot--amber {
  background: var(--amber-500);
}

.side__dot--brand {
  background: var(--brand-400);
}

.side__foot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}

.side__ai {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all var(--dur) var(--ease-out);
}

.side__ai:hover {
  background: rgba(108, 99, 255, 0.22);
  border-color: rgba(146, 136, 255, 0.45);
}

.side__ai-orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
  flex: none;
}

.side__ai strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.side__ai small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.side__ai-arrow {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.side__campus {
  margin: 0 6px 7px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.3);
}

.side__user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}

.side--collapsed .side__user {
  justify-content: center;
  padding: 8px 0;
}

.side__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 11px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex: none;
}

.side__user-info {
  flex: 1;
  min-width: 0;
}

.side__user-name {
  font-size: 12px;
  font-weight: 650;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side__user-meta {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
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
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: all var(--dur);
}

.side__logout:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>
