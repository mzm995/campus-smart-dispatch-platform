<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  EditPen,
  Lock,
  WarningFilled,
} from '@element-plus/icons-vue'
import SectionCard from '@/components/SectionCard.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { apiRequest } from '@/utils/api'

const props = defineProps({
  users: { type: Array, default: () => [] },
  roles: { type: Array, default: () => [] },
  currentUserId: { type: String, default: '' },
  deletableIds: { type: Array, default: () => [] },
  superAdmin: { type: Boolean, default: false },
})

const emit = defineEmits(['selected', 'saved', 'delete-user'])

const PERMISSION_MODULES = [
  { key: 'dashboard', label: '工作台' },
  { key: 'classroom', label: '教室借用' },
  { key: 'lostfound', label: '失物招领' },
  { key: 'groupbuy', label: '拼单集市' },
  { key: 'forum', label: '校园论坛' },
  { key: 'notifications', label: '消息通知' },
  { key: 'aiRecords', label: 'AI 记录' },
  { key: 'admin', label: '系统管理' },
]

const targetId = ref('')
const draftRole = ref('')
const saving = ref(false)

function canEdit(row) {
  return Boolean(
    props.superAdmin &&
      row &&
      !row.isDeleted &&
      row.id !== props.currentUserId &&
      row.roleKey !== 'super_admin',
  )
}

const target = computed(
  () => props.users.find((row) => row.id === targetId.value) || null,
)
const selectedRole = computed(
  () =>
    props.roles.find((role) => role.key === draftRole.value) ||
    props.roles.find((role) => role.key === target.value?.roleKey) ||
    null,
)
const preview = computed(
  () => selectedRole.value?.permissions || target.value?.permissions || null,
)
const dirty = computed(
  () => Boolean(target.value) && draftRole.value !== target.value.roleKey,
)
const actionCount = computed(
  () => Object.keys(preview.value?.actions || {}).length,
)

watch(
  () => props.users,
  (users) => {
    const current = users.find((row) => row.id === targetId.value && canEdit(row))
    if (current) {
      draftRole.value = current.roleKey
      return
    }
    const initial = users.find((row) => canEdit(row))
    targetId.value = initial?.id || ''
    draftRole.value = initial?.roleKey || ''
    emit('selected', targetId.value)
  },
  { immediate: true, deep: true },
)

function open(row, shouldScroll = false) {
  if (!canEdit(row)) {
    ElMessage.info(
      row?.id === props.currentUserId
        ? '已切换到当前账号权限，仅可查看'
        : row?.roleKey === 'super_admin'
          ? '已切换到高级管理员权限，仅可查看'
          : '已切换到该账号权限，仅可查看',
    )
  }
  targetId.value = row.id
  draftRole.value = row.roleKey
  emit('selected', row.id)
  if (shouldScroll) {
    window.setTimeout(() => {
      document
        .querySelector('.permission-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }
}

defineExpose({ open })

function userPill(row) {
  if (row.isDeleted) return { status: 'cancelled', text: '已删除' }
  if (row.status === 'active') return { status: 'approved', text: '启用' }
  if (row.status === 'pending') return { status: 'pending', text: '待审核' }
  return { status: 'cancelled', text: '已停用' }
}

function accessLabel(role) {
  const level = Number(role?.level || 0)
  if (level >= 100) return '全局管理'
  if (level >= 80) return '管理级'
  if (level >= 30) return '编辑级'
  if (level >= 20) return '协作级'
  return '基础级'
}

function roleDescription(role) {
  return {
    student: '参与失物、拼单、论坛与个人记录',
    monitor: '学生能力，并增加教室申请权限',
    forum_moderator: '学生能力，并增加论坛内容管理',
    admin: '管理教室审核、内容与其他用户数据',
    super_admin: '全局系统管理权限',
  }[role?.key] || '按角色策略分配访问能力'
}

function restoreDraft() {
  if (target.value) draftRole.value = target.value.roleKey
}

async function savePermission() {
  if (!props.superAdmin) {
    ElMessage.error('只有高级管理员可以修改其他账号权限')
    return
  }
  if (!target.value || !canEdit(target.value)) {
    ElMessage.warning('当前账号不可修改权限')
    return
  }
  if (!dirty.value || saving.value) return
  const role = props.roles.find((item) => item.key === draftRole.value)
  if (!role) {
    ElMessage.warning('请选择有效角色')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将 ${target.value.name} 调整为「${role.label}」？保存后访问范围会立即更新。`,
      '保存账号权限',
      {
        confirmButtonText: '确认保存',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  saving.value = true
  try {
    const data = await apiRequest(
      `/system/users/${encodeURIComponent(target.value.id)}/permissions`,
      {
        method: 'PATCH',
        body: { roleKey: role.key },
      },
    )
    draftRole.value = data.user.roleKey
    emit('saved', data.user)
    ElMessage.success(
      `${data.user.name} 的权限已更新为「${data.user.role}」`,
    )
  } catch (error) {
    ElMessage.error(error?.message || '权限保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SectionCard
    class="permission-editor"
    title="权限管理"
    desc="选择账号后调整角色与访问级别，保存后立即写入服务端权限策略。"
  >
    <template #actions>
      <span class="tag-soft tag-soft--amber">
        <el-icon><Lock /></el-icon>
        仅高级管理员
      </span>
    </template>

    <div v-if="target" class="permission-editor__body">
      <div class="permission-target">
        <UserAvatar
          class="permission-target__avatar"
          :name="target.name"
          :user-id="target.id"
          :src="target.avatarUrl"
          :size="38"
          :radius="11"
        />
        <div class="permission-target__copy">
          <strong>{{ target.name }}</strong>
          <span class="mono">{{ target.studentNo }} · {{ target.college }}</span>
        </div>
        <StatusPill
          :status="userPill(target).status"
          :text="userPill(target).text"
        />
      </div>

      <div class="permission-form-grid">
        <label class="permission-field">
          <span>角色权限</span>
          <el-select
            v-model="draftRole"
            :disabled="saving || !canEdit(target)"
            placeholder="选择角色"
          >
            <el-option
              v-for="role in roles"
              :key="role.key"
              :label="`${role.label} · L${role.level}`"
              :value="role.key"
            />
          </el-select>
        </label>
        <div class="permission-access">
          <span>访问级别</span>
          <strong>{{ accessLabel(selectedRole) }}</strong>
          <small class="mono">
            Level {{ selectedRole?.level || target.roleLevel }} ·
            {{ actionCount }} 项操作权限
          </small>
        </div>
      </div>

      <p class="permission-role-note">{{ roleDescription(selectedRole) }}</p>

      <div class="permission-modules">
        <span
          v-for="module in PERMISSION_MODULES"
          :key="module.key"
          class="permission-module"
          :class="{ 'is-enabled': preview?.modules?.[module.key] }"
        >
          <el-icon>
            <CircleCheck v-if="preview?.modules?.[module.key]" />
            <Lock v-else />
          </el-icon>
          {{ module.label }}
        </span>
      </div>

      <div class="permission-editor__foot">
        <p>
          <el-icon><WarningFilled /></el-icon>
          当前账号、高级管理员和已删除账号受保护，不能修改权限。
        </p>
        <div class="permission-editor__actions">
          <el-button
            v-if="deletableIds.includes(target.id)"
            text
            type="danger"
            @click="emit('delete-user', target)"
          >
            删除账号
          </el-button>
          <el-button plain :disabled="!dirty || saving" @click="restoreDraft">
            恢复
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!dirty || !canEdit(target)"
            @click="savePermission"
          >
            <el-icon><EditPen /></el-icon>
            保存权限
          </el-button>
        </div>
      </div>
    </div>

    <EmptyState
      v-else
      title="没有可编辑账号"
      desc="当前账号或受保护账号不会出现在权限编辑范围内。"
      compact
    />
  </SectionCard>

  <SectionCard
    class="permission-boundary"
    title="权限边界"
    desc="角色决定模块和操作范围，保存后由服务端在每次请求中重新校验。"
  >
    <div class="permission-guide">
      <article>
        <span class="mono">01</span>
        <strong>角色继承</strong>
        <p>学生、班委、论坛坛主和管理员拥有逐级扩展的访问能力。</p>
      </article>
      <article>
        <span class="mono">02</span>
        <strong>账号保护</strong>
        <p>当前账号、高级管理员和已删除账号不能被修改权限。</p>
      </article>
      <article>
        <span class="mono">03</span>
        <strong>全程审计</strong>
        <p>每次权限调整都会记录操作人、目标账号与调整前后角色。</p>
      </article>
    </div>
  </SectionCard>
</template>

<style scoped>
.permission-editor,
.permission-boundary {
  overflow: hidden;
}

.permission-editor__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.permission-target {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid var(--brand-100);
  border-radius: 12px;
  background: linear-gradient(120deg, var(--brand-50), rgba(18, 179, 166, 0.055));
}

.permission-target__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 11px;
  color: #fff;
  font-size: 13px;
  font-weight: 750;
}

.permission-target__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.permission-target__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.permission-target__copy strong {
  font-size: 13px;
  color: var(--text-1);
}

.permission-target__copy span {
  overflow: hidden;
  font-size: 10.5px;
  color: var(--text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(160px, 0.9fr);
  gap: 12px;
}

.permission-field,
.permission-access {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.permission-field > span,
.permission-access > span {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-3);
}

.permission-field :deep(.el-select) {
  width: 100%;
}

.permission-access {
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.permission-access strong {
  font-size: 14px;
  color: var(--text-1);
}

.permission-access small {
  font-size: 10px;
  color: var(--text-4);
}

.permission-role-note {
  margin: -2px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}

.permission-modules {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.permission-module {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 7px 6px;
  border: 1px dashed var(--line);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text-4);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.permission-module.is-enabled {
  border-style: solid;
  border-color: rgba(18, 179, 166, 0.2);
  background: var(--teal-50);
  color: var(--teal-600);
}

.permission-editor__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.permission-editor__foot p {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  max-width: 390px;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-4);
}

.permission-editor__foot p .el-icon {
  flex: none;
  margin-top: 2px;
  color: var(--amber-500);
}

.permission-editor__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.permission-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.permission-guide article {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-2);
}

.permission-guide article > span {
  display: block;
  margin-bottom: 7px;
  color: var(--brand-500);
  font-size: 10px;
}

.permission-guide strong {
  display: block;
  font-size: 12px;
  color: var(--text-1);
}

.permission-guide p {
  margin: 4px 0 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .permission-form-grid,
  .permission-modules,
  .permission-guide {
    grid-template-columns: minmax(0, 1fr);
  }

  .permission-editor__foot {
    align-items: stretch;
    flex-direction: column;
  }

  .permission-editor__actions {
    width: 100%;
  }

  .permission-editor__actions :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }
}
</style>
