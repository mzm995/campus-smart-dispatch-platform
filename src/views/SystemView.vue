<!-- 高级管理员系统控制台；普通管理员不再拥有系统管理页面或接口。 -->
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Cpu,
  DataAnalysis,
  Delete,
  Connection,
  Key,
  Lock,
  Operation,
  Refresh,
  Search,
  Timer,
  User,
  WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import SceneIcon from '@/components/SceneIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import PermissionManager from './system/PermissionManager.vue'
import ResetAllContentCard from './system/ResetAllContentCard.vue'
import { useUserStore } from '@/stores/user'
import { useDispatchStore } from '@/stores/dispatch'
import { apiRequest } from '@/utils/api'
import { clearBusinessState } from '@/utils/storage'
import {
  saveDeepSeekKey,
  testDeepSeekConnection,
} from '@/utils/aiCloud'
import { fmtDateTime, maskStudentNo, timeAgo } from '@/utils/format'

const router = useRouter()
const auth = useUserStore()
const dispatch = useDispatchStore()

const loading = ref(true)
const pageError = ref('')
const saving = ref(false)
const userRows = ref([])
const roleOptions = ref([])
const auditLogs = ref([])
const managingUserId = ref('')
const deletingUserId = ref('')
const apiKeyInput = ref('')
const savingAiProvider = ref(false)
const testingAiProvider = ref(false)
const aiProvider = reactive({
  provider: 'deepseek',
  displayName: 'DeepSeek-V4.1-Flash',
  model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com',
  enabled: true,
  configured: false,
  keyLast4: '',
  keyUpdatedAt: null,
  lastTestOk: null,
  lastTestAt: null,
  lastError: '',
})
const studentNumbers = reactive({
  startNumber: '21040001',
  nextStudentNo: '21040001',
  availableCount: 0,
  allocatedCount: 0,
})
const userFilter = ref('all')
const userKeyword = ref('')
const activeConsole = ref('accounts')
const resettingDemo = ref(false)
const permissionTargetId = ref('')
const permissionManager = ref()

const SCENES = [
  {
    key: 'classroom',
    name: '教室借用',
    desc: '按人数、设备与时段推荐空闲教室',
  },
  {
    key: 'lostfound',
    name: '失物招领',
    desc: '颜色、地点与时间三维修正的匹配线索',
  },
  {
    key: 'groupbuy',
    name: '拼团广场',
    desc: '拼奶茶、拼水果，自动汇总成团进度',
  },
  {
    key: 'forum',
    name: '校园论坛',
    desc: '发帖求助、分享讨论，AI 生成标题与相似帖',
  },
]

const SCENE_META = {
  classroom: { label: '教室借用', tone: 'brand' },
  lostfound: { label: '失物招领', tone: 'teal' },
  groupbuy: { label: '拼团广场', tone: 'amber' },
  forum: { label: '校园论坛', tone: 'coral' },
}

const LOG_STATUS = {
  已完成: { status: 'resolved', text: '已完成', tone: 'teal' },
  匹配成功: { status: 'matching', text: '匹配成功', tone: 'teal' },
  进行中: { status: 'ongoing', text: '进行中', tone: 'brand' },
  待处理: { status: 'open', text: '待处理', tone: 'coral' },
}

const sceneSwitches = reactive({
  classroom: true,
  lostfound: true,
  groupbuy: true,
  forum: true,
})

const aiForm = reactive({
  threshold: 0.72,
  timeout: 8,
  fallback: true,
  humanReview: true,
})

const DEFAULT_AI = {
  threshold: 0.72,
  timeout: 8,
  fallback: true,
  humanReview: true,
}

const userFilters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '启用' },
  { key: 'pending', label: '待审核' },
  { key: 'disabled', label: '已停用' },
  { key: 'deleted', label: '已删除' },
]

const thresholdPct = computed(() => Math.round(aiForm.threshold * 100))
const onlineScenes = computed(
  () => Object.values(sceneSwitches).filter(Boolean).length,
)
const activeUsers = computed(
  () =>
    userRows.value.filter((item) => !item.isDeleted && item.status === 'active').length,
)
const canManageUsers = computed(() => auth.canManageUsers)
const avgConfidence = computed(() => {
  const records = dispatch.records
  if (!records.length) return null
  const total = records.reduce((sum, item) => sum + Number(item.confidence || 0), 0)
  return Math.round((total / records.length) * 100)
})

const userCounts = computed(() => ({
  all: userRows.value.length,
  active: userRows.value.filter((item) => userStatusKey(item) === 'active').length,
  pending: userRows.value.filter((item) => userStatusKey(item) === 'pending').length,
  disabled: userRows.value.filter((item) => userStatusKey(item) === 'disabled').length,
  deleted: userRows.value.filter((item) => userStatusKey(item) === 'deleted').length,
}))

const filteredUsers = computed(() => {
  const kw = userKeyword.value.trim().toLowerCase()
  return userRows.value.filter((item) => {
    if (userFilter.value !== 'all' && userStatusKey(item) !== userFilter.value) return false
    if (!kw) return true
    return `${item.name} ${item.studentNo} ${item.role} ${item.college} ${item.source}`
      .toLowerCase()
      .includes(kw)
  })
})
const deletableUserIds = computed(
  () => userRows.value.filter((row) => canDeleteUser(row)).map((row) => row.id),
)

async function loadAdmin() {
  loading.value = true
  pageError.value = ''
  try {
    if (!auth.isSuperAdmin) return
    const data = await apiRequest('/system/bootstrap')
    userRows.value = data.users || []
    roleOptions.value = data.assignableRoles || []
    auditLogs.value = data.auditLogs || []
    Object.assign(studentNumbers, data.studentNumbers || {})
    Object.assign(aiProvider, data.aiProvider || {})
    Object.assign(sceneSwitches, data.settings?.sceneSwitches || {})
    Object.assign(aiForm, data.settings?.aiParams || {})
  } catch (error) {
    pageError.value = error?.message || '后端管理数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadAdmin)

function sceneMeta(scene) {
  return SCENE_META[scene] || { label: '其他场景', tone: 'brand' }
}

function sceneLogCount(scene) {
  return dispatch.records.filter((item) => item.scene === scene).length
}

function logStatus(row) {
  return LOG_STATUS[row.status] || { status: 'done', text: row.status || '已记录', tone: 'teal' }
}

function confidenceTone(value) {
  if (value < 0.72) return 'amber'
  if (value >= 0.9) return 'teal'
  return 'brand'
}

function userPill(row) {
  if (row.isDeleted) return { status: 'cancelled', text: '已删除' }
  if (row.status === 'active') return { status: 'approved', text: '启用' }
  if (row.status === 'pending') return { status: 'pending', text: '待审核' }
  return { status: 'cancelled', text: '已停用' }
}

function canEditUser(row) {
  return (
    canManageUsers.value &&
    !row.isDeleted &&
    row.id !== auth.user?.id &&
    row.roleKey !== 'super_admin'
  )
}

function canDeleteUser(row) {
  return (
    canManageUsers.value &&
    !row.isDeleted &&
    row.id !== auth.user?.id &&
    row.roleKey !== 'super_admin' &&
    row.source === 'custom'
  )
}

function userStatusKey(row) {
  return row.isDeleted ? 'deleted' : row.status
}

async function refreshAuditLogs() {
  try {
    const data = await apiRequest('/system/audit-logs')
    auditLogs.value = data.logs || []
  } catch {
    // 管理数据已加载时，审计列表刷新失败不影响主要操作。
  }
}

async function toggleUser(row, enabled) {
  if (!canEditUser(row) || managingUserId.value) return
  const nextStatus = enabled ? 'active' : 'disabled'
  managingUserId.value = row.id
  try {
    const data = await apiRequest(`/system/users/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: { status: nextStatus },
    })
    Object.assign(row, data.user)
    await refreshAuditLogs()
    ElMessage.success(`${row.name} 的账号已${enabled ? '启用' : '停用'}`)
  } catch (error) {
    ElMessage.error(error?.message || '账号状态更新失败')
  } finally {
    managingUserId.value = ''
  }
}

function editUserPermission(row, shouldScroll = false) {
  permissionTargetId.value = row.id
  permissionManager.value?.open(row, shouldScroll)
}

function handlePermissionSelected(userId) {
  permissionTargetId.value = userId || ''
}

async function handlePermissionSaved(user) {
  const row = userRows.value.find((item) => item.id === user.id)
  if (row) Object.assign(row, user)
  permissionTargetId.value = user.id
  await refreshAuditLogs()
}

async function deleteUser(row) {
  if (!canDeleteUser(row) || deletingUserId.value) return
  try {
    await ElMessageBox.confirm(
      `删除 ${row.name}（${row.studentNo}）？记录会保留在数据库中，学号将优先分配给下一名新人物。`,
      '删除账号',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  deletingUserId.value = row.id
  try {
    const data = await apiRequest(`/system/users/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    })
    Object.assign(row, data.user)
    Object.assign(studentNumbers, data.studentNumbers || {})
    await refreshAuditLogs()
    ElMessage.success(
      `${row.name} 已删除，学号 ${data.user.studentNo} 已进入继承池`,
    )
  } catch (error) {
    ElMessage.error(error?.message || '账号删除失败')
  } finally {
    deletingUserId.value = ''
  }
}

function onSceneChange(scene, enabled) {
  ElMessage.info(`${scene.name}场景已${enabled ? '开启' : '关闭'}，点击“保存配置”后写入数据库`)
}

function formatThreshold(value) {
  return `${Math.round(value * 100)}%`
}

async function persistSettings(successMessage) {
  if (saving.value) return
  saving.value = true
  try {
    const data = await apiRequest('/system/settings', {
      method: 'PATCH',
      body: {
        sceneSwitches: { ...sceneSwitches },
        aiParams: { ...aiForm },
      },
    })
    Object.assign(sceneSwitches, data.settings.sceneSwitches)
    Object.assign(aiForm, data.settings.aiParams)
    await refreshAuditLogs()
    ElMessage.success(successMessage)
  } catch (error) {
    ElMessage.error(error?.message || '系统配置保存失败')
  } finally {
    saving.value = false
  }
}

async function saveAiParams() {
  await persistSettings(
    `AI 参数已写入数据库：置信度阈值 ${thresholdPct.value}%，超时 ${aiForm.timeout} 秒`,
  )
}

async function saveAiProviderKey() {
  if (!auth.isSuperAdmin || savingAiProvider.value) return
  const apiKey = apiKeyInput.value.trim()
  if (!apiKey) {
    ElMessage.warning('请输入 DeepSeek API Key')
    return
  }
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey)) {
    ElMessage.warning('API Key 格式无效，应以 sk- 开头并包含至少 16 个有效字符')
    return
  }
  savingAiProvider.value = true
  try {
    const data = await saveDeepSeekKey(apiKey)
    Object.assign(aiProvider, data.provider)
    apiKeyInput.value = ''
    await refreshAuditLogs()
    ElMessage.success('DeepSeek API Key 已加密保存，请继续测试连接')
  } catch (error) {
    ElMessage.error(error?.message || 'API Key 保存失败')
  } finally {
    savingAiProvider.value = false
  }
}

async function testAiProvider() {
  if (!auth.isSuperAdmin || testingAiProvider.value) return
  testingAiProvider.value = true
  try {
    const data = await testDeepSeekConnection()
    Object.assign(aiProvider, data.provider)
    await refreshAuditLogs()
    ElMessage.success(`DeepSeek 连接成功，模型：${data.model}`)
  } catch (error) {
    aiProvider.lastTestOk = false
    aiProvider.lastError = error?.message || '连接测试失败'
    ElMessage.error(aiProvider.lastError)
  } finally {
    testingAiProvider.value = false
  }
}

async function saveAll() {
  await persistSettings(
    `系统配置已写入数据库：${onlineScenes.value} 个场景上线，阈值 ${thresholdPct.value}%`,
  )
}

function resetAiParams() {
  Object.assign(aiForm, DEFAULT_AI)
  ElMessage.info('AI 参数已恢复为推荐默认值（尚未保存）')
}

async function clearLogs() {
  if (!dispatch.records.length) return
  try {
    await ElMessageBox.confirm(
      `将清空云端共享的 ${dispatch.records.length} 条调度日志，所有用户都会同步此操作。`,
      '清空操作日志',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  dispatch.clear()
  ElMessage.success('操作日志已清空')
}

async function resetSharedDemoData() {
  if (resettingDemo.value) return
  try {
    await ElMessageBox.confirm(
      '将清除所有共享业务数据、通知、AI 调用记录和审计日志，并恢复内置演示数据。账号和系统配置会保留。',
      '重置共享演示数据',
      {
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  resettingDemo.value = true
  try {
    await apiRequest('/system/reset-demo', { method: 'POST' })
    clearBusinessState()
    ElMessage.success('演示数据已重置，正在重新加载…')
    window.setTimeout(() => window.location.reload(), 650)
  } catch (error) {
    ElMessage.error(error?.message || '演示数据重置失败')
  } finally {
    resettingDemo.value = false
  }
}

function resetFilters() {
  userKeyword.value = ''
  userFilter.value = 'all'
}

function auditDetail(row) {
  const detail = row.detail || {}
  if (detail.before && detail.after) {
    const before = `${detail.before.roleKey || '—'} / ${detail.before.status || '—'}`
    const after = `${detail.after.roleKey || '—'} / ${detail.after.status || '—'}`
    return `${before} → ${after}`
  }
  if (detail.name && detail.studentNo) return `${detail.name} · ${detail.studentNo}`
  if (detail.fields) return `更新字段：${detail.fields.join('、')}`
  return '已记录'
}

function sourceLabel(source) {
  return source === 'builtin' ? '内置演示账号' : '自定义演示账号'
}

function tableRowClass({ row }) {
  return [
    row.isDeleted ? 'is-deleted-row' : '',
    row.id === permissionTargetId.value ? 'is-permission-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
</script>

<template>
  <div class="page admin">
    <PageHeader
      eyebrow="系统设置"
      title="系统控制台"
      desc="集中管理账号权限、场景配置、模型接入与审计记录，仅高级管理员可进入。"
    >
      <template #meta>
        <div v-if="auth.isSuperAdmin" class="row wrap gap-2">
          <span class="tag-soft">
            <el-icon><Lock /></el-icon>
            高级管理员视图
          </span>
          <span class="t-xs faint">当前账号：{{ auth.user?.name }}</span>
        </div>
      </template>
      <template #actions>
        <div v-if="auth.isSuperAdmin && !loading && !pageError" class="row gap-2 wrap">
          <el-button
            plain
            :loading="resettingDemo"
            @click="resetSharedDemoData"
          >
            <el-icon><Refresh /></el-icon>
            重置共享演示数据
          </el-button>
          <el-button type="primary" :loading="saving" @click="saveAll">
            保存配置
          </el-button>
        </div>
      </template>
    </PageHeader>

    <div v-if="loading" class="card card--pad-lg admin-loading">
      <el-skeleton :rows="9" animated />
    </div>

    <div v-else-if="!auth.isSuperAdmin" class="card card--pad-lg admin-state">
      <div class="admin-state__icon">
        <el-icon><Lock /></el-icon>
      </div>
      <h3>需要高级管理员权限</h3>
      <p>普通管理员已不再拥有系统管理入口和接口权限。系统控制台仅保留给高级管理员。</p>
      <div class="row gap-3 wrap">
        <el-button type="primary" @click="router.push('/login?redirect=/system')">
          切换高级管理员账号
        </el-button>
        <el-button plain @click="router.push('/')">返回首页</el-button>
      </div>
    </div>

    <div v-else-if="pageError" class="card card--pad-lg admin-state">
      <div class="admin-state__icon admin-state__icon--coral">
        <el-icon><WarningFilled /></el-icon>
      </div>
      <h3>系统数据加载失败</h3>
      <p>{{ pageError }}</p>
      <div class="row gap-3 wrap">
        <el-button type="primary" @click="loadAdmin">重新加载</el-button>
        <el-button plain @click="router.push('/profile')">去重置演示数据</el-button>
      </div>
    </div>

    <template v-else>
      <!-- 概览 -->
      <div class="grid g4">
        <StatTile
          label="在册用户"
          :value="userRows.length"
          suffix="人"
          hint="内置账号与自定义演示账号，由 SQLite 统一保存"
          tone="brand"
        >
          <template #icon>
            <el-icon><User /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="已启用账号"
          :value="activeUsers"
          suffix="人"
          hint="待审核、停用与已删除账号不占用场景权限"
          tone="teal"
        >
          <template #icon>
            <el-icon><CircleCheck /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="上线场景"
          :value="onlineScenes"
          suffix="/ 4"
          hint="关闭后前台入口保留但不可提交"
          tone="amber"
        >
          <template #icon>
            <el-icon><Operation /></el-icon>
          </template>
        </StatTile>
        <StatTile
          label="调度日志"
          :value="dispatch.records.length"
          suffix="条"
          :hint="avgConfidence === null ? '暂无调度记录' : `平均置信度 ${avgConfidence}%`"
          tone="coral"
        >
          <template #icon>
            <el-icon><DataAnalysis /></el-icon>
          </template>
        </StatTile>
      </div>

      <nav class="console-nav" aria-label="系统控制台分区">
        <button
          type="button"
          class="console-nav__item"
          :class="{ 'is-active': activeConsole === 'accounts' }"
          @click="activeConsole = 'accounts'"
        >
          <span class="console-nav__icon"><el-icon><User /></el-icon></span>
          <span>
            <strong>账号与配置</strong>
            <small>角色、学号、场景与模型接入</small>
          </span>
          <b class="mono">{{ userRows.length }}</b>
        </button>
        <button
          type="button"
          class="console-nav__item"
          :class="{ 'is-active': activeConsole === 'logs' }"
          @click="activeConsole = 'logs'"
        >
          <span class="console-nav__icon console-nav__icon--teal"><el-icon><DataAnalysis /></el-icon></span>
          <span>
            <strong>日志与审计</strong>
            <small>调度记录、账号操作与权限变更</small>
          </span>
          <b class="mono">{{ dispatch.records.length + auditLogs.length }}</b>
        </button>
      </nav>

      <div v-show="activeConsole === 'accounts'" class="grid g-7-5 admin-grid">
        <div class="admin-main">
          <!-- 用户与角色 -->
          <SectionCard
          title="用户与角色"
          :desc="`学号从 ${studentNumbers.startNumber} 起自动分配，下一可用学号 ${studentNumbers.nextStudentNo}；已释放号码 ${studentNumbers.availableCount} 个。`"
          >
          <template #actions>
            <el-input
              v-model="userKeyword"
              class="admin-search"
              placeholder="搜索姓名 / 学号 / 专业"
              :prefix-icon="Search"
              clearable
            />
          </template>

          <div class="chip-row admin-filter-row">
            <button
              v-for="item in userFilters"
              :key="item.key"
              type="button"
              class="chip"
              :class="{ 'is-active': userFilter === item.key }"
              @click="userFilter = item.key"
            >
              {{ item.label }}
              <span class="admin-chip-count">{{ userCounts[item.key] }}</span>
            </button>
            <span class="admin-filter-row__total">{{ filteredUsers.length }} 条</span>
          </div>

          <div v-if="filteredUsers.length === 0" class="admin-empty">
            <EmptyState
              title="没有匹配的成员"
              desc="换一个关键词，或清空筛选后再看看。"
              compact
            >
              <el-button plain size="small" @click="resetFilters">清空筛选</el-button>
            </EmptyState>
          </div>

          <template v-else>
            <div class="admin-desk">
              <el-table
                :data="filteredUsers"
                row-key="id"
                class="admin-table"
                :max-height="520"
                :row-class-name="tableRowClass"
              >
                <el-table-column label="成员" min-width="148">
                  <template #default="{ row }">
                    <div class="admin-user">
                      <button
                        type="button"
                        class="admin-avatar-button"
                        :title="`切换为 ${row.name} 的权限`"
                        @click.stop="editUserPermission(row, true)"
                      >
                        <UserAvatar
                          class="admin-user__avatar"
                          :name="row.name"
                          :user-id="row.id"
                          :src="row.avatarUrl"
                          :size="30"
                          :radius="10"
                        />
                      </button>
                      <div class="admin-user__meta">
                        <span class="admin-user__name">{{ row.name }}</span>
                        <span class="admin-user__source">{{ sourceLabel(row.source) }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="学号" width="100">
                  <template #default="{ row }">
                    <span class="mono t-sm">{{ maskStudentNo(row.studentNo) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="角色 / 权限" min-width="140">
                  <template #default="{ row }">
                    <span
                      class="tag-soft"
                      :class="
                        row.roleKey === 'super_admin' || row.roleKey === 'admin'
                          ? 'tag-soft--brand'
                          : ''
                      "
                    >
                      {{ row.role }}
                    </span>
                    <span class="admin-role-level mono">L{{ row.roleLevel }}</span>
                  </template>
                </el-table-column>
                <el-table-column
                  label="专业/部门"
                  prop="college"
                  min-width="104"
                  show-overflow-tooltip
                />
                <el-table-column label="状态" width="80">
                  <template #default="{ row }">
                    <StatusPill
                      :status="userPill(row).status"
                      :text="userPill(row).text"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="启停" width="72" align="right">
                  <template #default="{ row }">
                    <el-switch
                      :model-value="row.status === 'active'"
                      :disabled="!canEditUser(row) || Boolean(managingUserId)"
                      :aria-label="`启用或停用 ${row.name}`"
                      @change="(value) => toggleUser(row, value)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="72" align="right">
                  <template #default="{ row }">
                    <div class="admin-row-actions">
                      <el-button
                        v-if="canEditUser(row)"
                        text
                        type="primary"
                        size="small"
                        :aria-label="`编辑 ${row.name} 的权限`"
                        @click.stop="editUserPermission(row, true)"
                      >
                        编辑
                      </el-button>
                      <span v-if="row.isDeleted" class="t-xs faint">已保留</span>
                      <span v-else-if="!canEditUser(row)" class="t-xs faint">受保护</span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <div class="admin-mob">
              <article
                v-for="row in filteredUsers"
                :key="row.id"
                class="admin-user-card"
                :class="{ 'is-deleted-card': row.isDeleted }"
              >
                <div class="admin-user-card__head">
                  <button
                    type="button"
                    class="admin-avatar-button"
                    :title="`切换为 ${row.name} 的权限`"
                    @click="editUserPermission(row, true)"
                  >
                    <UserAvatar
                      class="admin-user__avatar"
                      :name="row.name"
                      :user-id="row.id"
                      :src="row.avatarUrl"
                      :size="30"
                      :radius="10"
                    />
                  </button>
                  <div class="admin-user__meta">
                    <span class="admin-user__name">{{ row.name }}</span>
                    <span class="admin-user__source">
                      {{ row.role }} · {{ sourceLabel(row.source) }}
                    </span>
                  </div>
                  <StatusPill
                    :status="userPill(row).status"
                    :text="userPill(row).text"
                  />
                </div>
                <div class="admin-user-card__grid">
                  <div>
                    <span>学号</span>
                    <b class="mono">{{ maskStudentNo(row.studentNo) }}</b>
                  </div>
                  <div>
                    <span>专业/部门</span>
                    <b>{{ row.college }}</b>
                  </div>
                  <div>
                    <span>来源</span>
                    <b>{{ row.source }}</b>
                  </div>
                </div>
                <div class="admin-user-card__foot">
                  <div class="admin-user-card__role">
                    <span>权限</span>
                    <b>{{ row.role }} · L{{ row.roleLevel }}</b>
                    <el-button
                      v-if="canEditUser(row)"
                      text
                      type="primary"
                      size="small"
                      @click="editUserPermission(row, true)"
                    >
                      编辑权限
                    </el-button>
                  </div>
                  <div class="admin-user-card__status">
                    <span>启用账号</span>
                    <el-switch
                      :model-value="row.status === 'active'"
                      :disabled="!canEditUser(row) || Boolean(managingUserId)"
                      @change="(value) => toggleUser(row, value)"
                    />
                  </div>
                </div>
                <el-button
                  v-if="canDeleteUser(row)"
                  class="admin-user-card__delete"
                  plain
                  type="danger"
                  size="small"
                  :loading="deletingUserId === row.id"
                  @click="deleteUser(row)"
                >
                  <el-icon><Delete /></el-icon>
                  删除账号并释放学号
                </el-button>
              </article>
            </div>
          </template>

          <p class="admin-note">
            <el-icon><Lock /></el-icon>
            学号按「前 4 位 + **** + 后 2 位」脱敏展示；删除采用软删除，人物、权限、审计与原始学号完整保留，释放学号按删除先后进入继承池。
          </p>
        </SectionCard>

          <PermissionManager
            ref="permissionManager"
            :users="userRows"
            :roles="roleOptions"
            :current-user-id="auth.user?.id || ''"
            :deletable-ids="deletableUserIds"
            :super-admin="auth.isSuperAdmin"
            @selected="handlePermissionSelected"
            @saved="handlePermissionSaved"
            @delete-user="deleteUser"
          />
        </div>

        <!-- 场景与 AI 参数 -->
        <div class="admin-side">
          <SectionCard
            title="场景开关"
            desc="控制四个校园场景是否对同学开放，关闭后仍保留历史数据。"
          >
            <div class="scene-list">
              <div v-for="item in SCENES" :key="item.key" class="scene-row">
                <SceneIcon :scene="item.key" :size="40" />
                <div class="scene-row__text">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.desc }}</span>
                </div>
                <div class="scene-row__side">
                  <el-switch
                    v-model="sceneSwitches[item.key]"
                    @change="(value) => onSceneChange(item, value)"
                  />
                  <span class="scene-row__count">
                    {{ sceneLogCount(item.key) }} 条日志
                  </span>
                </div>
              </div>
            </div>
            <p class="admin-note">
              <span class="dot" :class="onlineScenes === 4 ? 'dot--teal' : 'dot--amber'"></span>
              {{ onlineScenes === 4 ? '四个场景均已上线' : `当前 ${onlineScenes} / 4 个场景上线` }}
            </p>
          </SectionCard>

          <SectionCard
            title="AI 参数"
            desc="影响所有场景的解析行为，修改后点击「保存参数」生效。"
          >
            <template #actions>
              <span class="tag-soft tag-soft--brand">
                <el-icon><Cpu /></el-icon>
                DeepSeek V4.1 Flash
              </span>
            </template>

            <div class="ai-param">
              <div class="ai-param__head">
                <span>置信度阈值</span>
                <strong>{{ thresholdPct }}%</strong>
              </div>
              <el-slider
                v-model="aiForm.threshold"
                :min="0.5"
                :max="0.95"
                :step="0.01"
                :format-tooltip="formatThreshold"
              />
              <p class="ai-param__hint">
                低于 {{ thresholdPct }}% 的解析结果会标记「待人工确认」，建议不低于 72%。
              </p>
            </div>

            <div class="ai-param-row">
              <div class="ai-param-row__text">
                <strong>超时时间</strong>
                <p>AI 解析超过该时长自动切换本地规则引擎</p>
              </div>
              <div class="ai-param-row__control">
                <el-input-number
                  v-model="aiForm.timeout"
                  :min="3"
                  :max="30"
                  :step="1"
                  controls-position="right"
                />
                <span class="ai-param__unit">秒</span>
              </div>
            </div>

            <div class="ai-switch-row">
              <div class="ai-switch-row__text">
                <strong>AI 不可用时降级</strong>
                <p>接口超时或失败时自动使用本地规则引擎，页面不中断</p>
              </div>
              <el-switch v-model="aiForm.fallback" />
            </div>

            <div class="ai-switch-row">
              <div class="ai-switch-row__text">
                <strong>低置信度强制人工核对</strong>
                <p>低于阈值的解析结果必须由用户确认后才能提交</p>
              </div>
              <el-switch v-model="aiForm.humanReview" />
            </div>

            <div class="ai-param__actions">
              <el-button type="primary" :loading="saving" @click="saveAiParams">
                保存参数
              </el-button>
              <el-button text @click="resetAiParams">恢复默认</el-button>
              <span class="ai-param__saved">
                <el-icon><Timer /></el-icon>
                配置 API Key 后调用真实模型，异常时自动降级
              </span>
            </div>
          </SectionCard>

          <SectionCard
            title="DeepSeek 模型接入"
            desc="DeepSeek V4.1 Flash 使用官方模型标识 deepseek-flash，API Key 加密后保存在服务端。"
          >
            <template #actions>
              <span
                class="tag-soft"
                :class="
                  aiProvider.configured && aiProvider.lastTestOk === true
                    ? 'tag-soft--teal'
                    : aiProvider.configured
                      ? 'tag-soft--amber'
                      : 'tag-soft--coral'
                "
              >
                {{
                  aiProvider.configured && aiProvider.lastTestOk === true
                    ? '连接正常'
                    : aiProvider.configured
                      ? '已配置待测试'
                      : '未配置'
                }}
              </span>
            </template>

            <div class="ai-provider-meta">
              <div>
                <span>模型</span>
                <strong>{{ aiProvider.displayName }}</strong>
              </div>
              <div>
                <span>模型标识</span>
                <strong class="mono">{{ aiProvider.model }}</strong>
              </div>
              <div>
                <span>接口地址</span>
                <strong class="mono">{{ aiProvider.baseUrl }}</strong>
              </div>
              <div>
                <span>当前密钥</span>
                <strong class="mono">
                  {{ aiProvider.configured ? `sk-••••${aiProvider.keyLast4}` : '尚未配置' }}
                </strong>
              </div>
            </div>

            <div v-if="auth.isSuperAdmin" class="ai-provider-config">
              <el-input
                v-model="apiKeyInput"
                type="password"
                show-password
                maxlength="200"
                autocomplete="off"
                placeholder="填入 DeepSeek API Key（只上传一次，不在页面回显）"
                :prefix-icon="Key"
              />
              <div class="ai-provider-actions">
                <el-button
                  type="primary"
                  :loading="savingAiProvider"
                  :disabled="!apiKeyInput.trim()"
                  @click="saveAiProviderKey"
                >
                  加密保存密钥
                </el-button>
                <el-button
                  plain
                  :icon="Connection"
                  :loading="testingAiProvider"
                  :disabled="!aiProvider.configured"
                  @click="testAiProvider"
                >
                  测试真实连接
                </el-button>
              </div>
            </div>
            <el-alert
              v-else
              title="仅高级管理员可以配置或测试 DeepSeek API Key"
              type="info"
              :closable="false"
              show-icon
            />

            <p v-if="aiProvider.lastTestAt" class="ai-provider-test">
              最近测试：{{ fmtDateTime(aiProvider.lastTestAt) }}
              <template v-if="aiProvider.lastError"> · {{ aiProvider.lastError }}</template>
            </p>
            <p class="admin-note">
              API Key 使用 AES-256-GCM 加密保存；浏览器只显示末 4 位，不返回完整密钥。
            </p>
          </SectionCard>

          <ResetAllContentCard />
        </div>
      </div>

      <!-- 操作日志 -->
      <SectionCard
        v-show="activeConsole === 'logs'"
        title="操作日志"
        desc="最近 40 条 AI 调度解析记录，包含原始需求、置信度与处理状态。"
      >
        <template #actions>
          <div class="row gap-2">
            <span class="tag-soft tag-soft--teal">
              {{ dispatch.records.length }} 条
            </span>
            <el-button
              text
              type="danger"
              :disabled="dispatch.records.length === 0"
              @click="clearLogs"
            >
              <el-icon><Delete /></el-icon>
              清空
            </el-button>
          </div>
        </template>

        <div v-if="dispatch.records.length === 0" class="admin-empty">
          <EmptyState
            title="暂无调度日志"
            desc="去首页用一句话体验 AI 调度，解析记录会自动写回这里。"
            compact
          >
            <el-button type="primary" size="small" @click="router.push('/')">
              去试试 AI 调度
            </el-button>
          </EmptyState>
        </div>

        <template v-else>
          <div class="log-desk">
            <el-table
              :data="dispatch.records"
              row-key="id"
              class="admin-table log-table"
              :max-height="420"
            >
              <el-table-column label="时间" width="130">
                <template #default="{ row }">
                  <div class="log-time">
                    <span class="mono">{{ fmtDateTime(row.createdAt) }}</span>
                    <span class="faint">{{ timeAgo(row.createdAt) }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="场景" width="108">
                <template #default="{ row }">
                  <span
                    class="tag-soft"
                    :class="`tag-soft--${sceneMeta(row.scene).tone}`"
                  >
                    {{ sceneMeta(row.scene).label }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="原始需求 / 解析结果" min-width="270">
                <template #default="{ row }">
                  <div class="log-demand">
                    <el-tooltip :content="row.raw" placement="top" :show-after="260">
                      <span class="log-demand__raw">{{ row.raw }}</span>
                    </el-tooltip>
                    <span class="log-demand__summary">{{ row.summary }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="置信度" width="138">
                <template #default="{ row }">
                  <div class="log-conf" :class="`log-conf--${confidenceTone(row.confidence)}`">
                    <span class="log-conf__bar">
                      <i :style="{ width: `${Math.round(row.confidence * 100)}%` }"></i>
                    </span>
                    <b class="mono">{{ Math.round(row.confidence * 100) }}%</b>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="104">
                <template #default="{ row }">
                  <StatusPill
                    :status="logStatus(row).status"
                    :text="logStatus(row).text"
                    :tone="logStatus(row).tone"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="log-mob">
            <article
              v-for="row in dispatch.records"
              :key="row.id"
              class="log-card"
            >
              <div class="log-card__head">
                <span
                  class="tag-soft"
                  :class="`tag-soft--${sceneMeta(row.scene).tone}`"
                >
                  {{ sceneMeta(row.scene).label }}
                </span>
                <span class="faint t-xs mono">{{ fmtDateTime(row.createdAt) }}</span>
                <StatusPill
                  :status="logStatus(row).status"
                  :text="logStatus(row).text"
                  :tone="logStatus(row).tone"
                />
              </div>
              <p class="log-card__raw">{{ row.raw }}</p>
              <p class="log-card__summary">{{ row.summary }}</p>
              <div class="log-card__conf">
                <span class="faint t-xs">置信度</span>
                <div class="log-conf" :class="`log-conf--${confidenceTone(row.confidence)}`">
                  <span class="log-conf__bar">
                    <i :style="{ width: `${Math.round(row.confidence * 100)}%` }"></i>
                  </span>
                  <b class="mono">{{ Math.round(row.confidence * 100) }}%</b>
                </div>
              </div>
            </article>
          </div>
        </template>
      </SectionCard>

      <SectionCard
        v-show="activeConsole === 'logs'"
        title="账号与权限审计"
        desc="登录、账号创建、权限调整和系统配置变更均由后端写入 SQLite 审计表。"
      >
        <template #actions>
          <span class="tag-soft tag-soft--brand">{{ auditLogs.length }} 条</span>
        </template>
        <div v-if="auditLogs.length === 0" class="admin-empty">
          <EmptyState title="暂无审计记录" desc="登录或调整权限后会自动留下记录。" compact />
        </div>
        <template v-else>
          <div class="audit-desk">
            <el-table
              :data="auditLogs"
              row-key="id"
              class="admin-table"
              :max-height="360"
            >
              <el-table-column label="时间" width="132">
                <template #default="{ row }">
                  <span class="mono t-sm">{{ fmtDateTime(row.createdAt) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作人" min-width="130">
                <template #default="{ row }">
                  <div class="log-demand">
                    <span class="log-demand__raw">{{ row.actor }}</span>
                    <span class="log-demand__summary mono">
                      {{ maskStudentNo(row.actorStudentNo) || '系统任务' }}
                    </span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="动作" prop="action" min-width="150" />
              <el-table-column label="变更详情" min-width="230">
                <template #default="{ row }">
                  <span class="t-sm muted">{{ auditDetail(row) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="audit-mob">
            <article v-for="row in auditLogs" :key="row.id" class="log-card">
              <div class="log-card__head">
                <span class="tag-soft tag-soft--brand">{{ row.action }}</span>
                <span class="faint t-xs mono">{{ fmtDateTime(row.createdAt) }}</span>
              </div>
              <p class="log-card__raw">{{ row.actor }}</p>
              <p class="log-card__summary">{{ auditDetail(row) }}</p>
            </article>
          </div>
        </template>
      </SectionCard>

      <div class="card admin-meta">
        <div class="admin-meta__item">
          <span>前端</span>
          <strong>Vue 3.5 · Vite 6</strong>
        </div>
        <div class="admin-meta__item">
          <span>AI 能力层</span>
          <strong>DeepSeek V4.1 Flash + 本地降级</strong>
        </div>
        <div class="admin-meta__item">
          <span>数据存储</span>
          <strong>SQLite 云端共享 + 本地缓存</strong>
        </div>
        <div class="admin-meta__item">
          <span>运行模式</span>
          <strong class="text-teal">Node.js 前后端一体</strong>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin {
  gap: 16px;
}
.console-nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
}
.console-nav__item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 12px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur), border-color var(--dur);
}
.console-nav__item:hover {
  background: var(--surface-2);
}
.console-nav__item.is-active {
  border-bottom-color: var(--brand-600);
  background: transparent;
  box-shadow: none;
}
.console-nav__item:not(.is-active) .console-nav__icon {
  color: var(--text-3);
  background: var(--surface-3);
}
.console-nav__item:not(.is-active) .console-nav__icon--teal {
  color: var(--text-3);
  background: var(--surface-3);
}
.console-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 8px;
  color: var(--brand-600);
  background: var(--brand-50);
  font-size: 18px;
}
.console-nav__icon--teal {
  color: var(--teal-600);
  background: var(--teal-50);
}
.console-nav__item > span:nth-child(2) {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}
.console-nav__item strong {
  font-size: 12px;
  color: var(--text-1);
}
.console-nav__item small {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}
.console-nav__item b {
  flex: none;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  color: var(--text-3);
  background: var(--surface-3);
  font-size: 12px;
}
.admin-loading {
  min-height: 320px;
}
/* ---------- 权限 / 错误 ---------- */
.admin-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 48px;
  padding-bottom: 48px;
  text-align: center;
}
.admin-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: var(--brand-50, #eef2f5);
  color: var(--brand-500);
  font-size: 24px;
  margin-bottom: 4px;
}
.admin-state__icon--coral {
  background: var(--coral-50, #fff0ef);
  color: var(--coral-500);
}
.admin-state h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-1);
}
.admin-state p {
  margin: 0 0 8px;
  max-width: 470px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}
/* ---------- 布局 ---------- */
.admin-grid {
  /* 左栏用户表 7 列合计约 716px，7-5 分栏在 1440 视口只剩 649px，
     会按比例压缩每一列；改为 8-4 让表格拿到完整列宽。 */
  grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  align-items: start;
}
.admin-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.admin-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.admin-search {
  width: 210px;
}
.admin-role-level {
  margin-left: 4px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--text-4);
}
.admin-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0px;
}
.admin-filter-row {
  margin-bottom: 12px;
}
.admin-chip-count {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.chip.is-active .admin-chip-count {
  color: rgba(255, 255, 255, 0.78);
}
.admin-filter-row__total {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
.admin-note {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.admin-note .el-icon,
.admin-note .dot {
  margin-top: 0px;
  flex: none;
}
.admin-empty {
  padding: 8px 0 4px;
}
/* ---------- 用户表 ---------- */
.admin-desk {
  display: block;
}
.admin-mob {
  display: none;
}
.admin-user {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.admin-avatar-button {
  display: inline-flex;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: transform var(--dur) var(--ease-out);
}
.admin-avatar-button:hover {
  background: var(--surface-2);
}
.admin-avatar-button:focus-visible {
  outline: 2px solid var(--brand-400);
  outline-offset: 2px;
}
.admin-user__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.admin-user__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.admin-user__meta {
  display: flex;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
}
.admin-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.35;
}
.admin-user__source {
  font-size: 12px;
  color: var(--text-4);
  line-height: 1.35;
}
.admin-table :deep(.el-table__cell) {
  padding: 8px 0;
}
.admin-table :deep(.el-switch) {
  --el-switch-on-color: var(--brand-500);
}
.admin-table :deep(.pill) {
  white-space: nowrap;
}
/* 角色列：标签与等级保持同一条基线，不再被挤成两行 */
.admin-table :deep(.tag-soft) {
  white-space: nowrap;
}
.admin-table :deep(.is-deleted-row) {
  opacity: 0.62;
}
.admin-table :deep(.is-permission-selected > td.el-table__cell) {
  background: var(--brand-50);
}
.admin-table :deep(.is-deleted-row .admin-user__name) {
  text-decoration: line-through;
}
.admin-user-card {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.admin-user-card + .admin-user-card {
  margin-top: 8px;
}
.admin-user-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.admin-user-card__head .admin-user__meta {
  flex: 1;
}
.admin-user-card__head :deep(.pill) {
  flex: none;
}
.admin-user-card__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.admin-user-card__grid div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.admin-user-card__grid span {
  font-size: 12px;
  color: var(--text-4);
}
.admin-user-card__grid b {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  word-break: break-all;
}
.admin-user-card__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-3);
}
.admin-user-card__role,
.admin-user-card__status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.admin-user-card.is-deleted-card {
  border-style: solid;
  background: var(--surface-2);
}
.admin-user-card__delete {
  width: 100%;
  margin-top: 12px;
}
.admin-user-card__role {
  flex: 1;
}
.admin-user-card__role :deep(.el-select) {
  width: 100%;
}
.admin-user-card__status {
  align-items: flex-end;
  flex: none;
}
/* ---------- 场景 ---------- */
.scene-list {
  display: flex;
  flex-direction: column;
}
.scene-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.scene-row:first-child {
  padding-top: 0px;
}
.scene-row:last-child {
  border-bottom: 0;
  padding-bottom: 0px;
}
.scene-row__text {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}
.scene-row__text strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}
.scene-row__text span {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
.scene-row__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
}
.scene-row__count {
  font-size: 12px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
/* ---------- AI 参数 ---------- */
.ai-param {
  padding: 0px 0 4px;
}
.ai-param__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0px;
  font-size: 12px;
  color: var(--text-2);
}
.ai-param__head strong {
  font-size: 18px;
  font-weight: 700;
  color: var(--brand-600, #33546b);
  font-variant-numeric: tabular-nums;
}
.ai-param :deep(.el-slider) {
  padding: 0 4px;
}
.ai-param__hint {
  margin: 0px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.ai-param-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.ai-param-row__text,
.ai-switch-row__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ai-param-row__text strong,
.ai-switch-row__text strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}
.ai-param-row__text p,
.ai-switch-row__text p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
.ai-param-row__control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.ai-param-row__control :deep(.el-input-number) {
  width: 104px;
}
.ai-param__unit {
  font-size: 12px;
  color: var(--text-3);
}
.ai-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.ai-switch-row :deep(.el-switch) {
  flex: none;
}
.ai-param__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.ai-param__saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 12px;
  color: var(--text-4);
}
.ai-provider-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ai-provider-meta > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.ai-provider-meta span {
  font-size: 12px;
  color: var(--text-4);
}
.ai-provider-meta strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-provider-config {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.ai-provider-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.ai-provider-test {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
/* ---------- 日志 ---------- */
.log-desk {
  display: block;
}
.log-mob {
  display: none;
}
.audit-mob {
  display: none;
}
.log-time {
  display: flex;
  flex-direction: column;
  gap: 0px;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.log-time .faint {
  font-size: 12px;
}
.log-demand {
  display: flex;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
}
.log-demand__raw {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}
.log-demand__summary {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-conf {
  display: flex;
  align-items: center;
  gap: 8px;
}
.log-conf__bar {
  flex: 1;
  height: 5px;
  border-radius: 1px;
  background: var(--surface-3);
  overflow: hidden;
}
.log-conf__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand-500);
}
.log-conf b {
  flex: none;
  min-width: 32px;
  font-size: 12px;
  color: var(--text-2);
  text-align: right;
}
.log-conf--teal .log-conf__bar i {
  background: var(--teal-500);
}
.log-conf--amber .log-conf__bar i {
  background: var(--amber-500);
}
.log-conf--amber b {
  color: var(--amber-600, #b7791f);
}
.log-card {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.log-card + .log-card {
  margin-top: 8px;
}
.log-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.log-card__head :deep(.pill) {
  margin-left: auto;
}
.log-card__raw {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--text-1);
}
.log-card__summary {
  margin: 0;
  padding: 8px 8px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
}
.log-card__conf {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.log-card__conf .log-conf {
  flex: 1;
}
/* ---------- 底部元信息 ---------- */
.admin-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 16px;
}
.admin-meta__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.admin-meta__item span {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--text-4);
}
.admin-meta__item strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
/* ---------- 响应式 ---------- */
@media (max-width: 1420px) {
  /* 1420 以下 8-4 分栏会让左栏掉到 716px 以下，把一点宽度让给用户表 */
  .admin-grid {
    grid-template-columns: minmax(0, 8.5fr) minmax(0, 3.5fr);
  }
}
@media (max-width: 1340px) {
  /* 左栏低于 716px 时表格会横向溢出，改为单栏让表格独占整行 */
  .admin-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .admin-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
@media (max-width: 1020px) {
  /* 单栏后内容区仍不足 716px：提前切到卡片视图，避免表格横向滚动 */
  .admin-desk {
    display: none;
  }
  .admin-mob {
    display: block;
  }
}
@media (max-width: 900px) {
  .admin-desk,
  .log-desk,
  .audit-desk {
    display: none;
  }
  .admin-mob,
  .log-mob,
  .audit-mob {
    display: block;
  }
  .admin-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .admin-search {
    width: 180px;
  }
}
@media (max-width: 720px) {
  .admin-side {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .admin {
    gap: 16px;
  }
  .console-nav {
    grid-template-columns: minmax(0, 1fr);
  }
  .admin-filter-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .admin-filter-row::-webkit-scrollbar {
    display: none;
  }
  .admin-filter-row :deep(.chip) {
    flex: none;
  }
  .admin-filter-row__total {
    display: none;
  }
  .admin-search {
    width: 100%;
  }
  .admin :deep(.sec__head) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .admin :deep(.sec__actions) {
    width: 100%;
  }
  .admin :deep(.sec__actions) .el-input,
  .admin :deep(.sec__actions) .admin-search {
    width: 100%;
  }
  .admin-user-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .scene-row {
    align-items: flex-start;
  }
  .scene-row__side {
    align-items: flex-end;
    padding-top: 0px;
  }
  .ai-param-row {
    flex-wrap: wrap;
  }
  .ai-param-row__control {
    width: 100%;
    justify-content: flex-end;
  }
  .ai-param__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .ai-param__actions :deep(.el-button) {
    margin-left: 0;
    width: 100%;
  }
  .ai-param__saved {
    margin-left: 0;
    justify-content: center;
  }
  .admin-meta {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 16px;
  }
  .admin-meta__item {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
}
</style>
