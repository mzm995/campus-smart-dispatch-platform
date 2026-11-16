<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Calendar,
  Camera,
  CircleCheck,
  Key,
  Lock,
  Message,
  Postcard,
  Refresh,
  School,
  Star,
  SwitchButton,
  User,
  WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useAvatarDirectoryStore } from '@/stores/avatar'
import { useUserStore } from '@/stores/user'
import { fmtDate } from '@/utils/format'
import { uploadImage } from '@/utils/image'
import { loadState, saveState, resetAll } from '@/utils/storage'

const PREFS_KEY = 'v1:profilePrefs'
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const DEFAULT_PREFS = {
  inApp: true,
  important: true,
  digest: false,
}

const router = useRouter()
const auth = useUserStore()
const avatars = useAvatarDirectoryStore()

const loading = ref(true)
const pageError = ref('')
const saving = ref(false)
const savingPassword = ref(false)
const formRef = ref(null)
const passwordFormRef = ref(null)
const avatarInput = ref(null)
const avatarFile = ref(null)
const avatarPreview = ref('')
const avatarUploading = ref(false)
const prefs = reactive({ ...DEFAULT_PREFS, ...(loadState(PREFS_KEY, {}) || {}) })

const form = reactive({
  name: '',
  college: '',
  bio: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const rules = {
  name: [
    { required: true, message: '请填写姓名', trigger: 'blur' },
    { max: 10, message: '姓名不能超过 10 个字', trigger: 'blur' },
  ],
  college: [{ required: true, message: '请选择专业方向', trigger: 'change' }],
  bio: [{ max: 60, message: '简介最多 60 个字符', trigger: 'blur' }],
}

const passwordRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 32, message: '新密码长度为 8–32 个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) callback(new Error('两次输入的新密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

const collegeOptions = computed(() => {
  const base = [
    'AI+人工智能',
    'AI+电商',
    'AI+影视',
    '电子竞技',
    'AI+设计',
    '无人机应用',
    '轨道交通',
    '学生工作处',
  ]
  const current = auth.user?.college
  return current && !base.includes(current) ? [current, ...base] : base
})

const dirty = computed(() => {
  if (!auth.user) return false
  return (
    form.name !== auth.user.name ||
    form.college !== auth.user.college ||
    (form.bio || '') !== (auth.user.bio || '')
  )
})

const completeness = computed(() => {
  if (!auth.user) return 0
  const fields = [auth.user.name, auth.user.college, auth.user.bio]
  return Math.round((fields.filter(Boolean).length / fields.length) * 100)
})
const avatarDisplayUrl = computed(() => avatarPreview.value || auth.avatarUrl)

const prefItems = [
  {
    key: 'inApp',
    icon: Bell,
    title: '站内通知',
    desc: '申请审核、失物匹配、拼单进度等关键节点提醒',
  },
  {
    key: 'important',
    icon: Star,
    title: '重要提醒强提示',
    desc: '重要未读消息在通知中心保留红色标记与置顶',
  },
  {
    key: 'digest',
    icon: Message,
    title: '每周摘要',
    desc: '每周一汇总上周的调度与 AI 使用情况（演示开关）',
  },
]

let timer = null

function fillForm() {
  if (!auth.user) return
  form.name = auth.user.name
  form.college = auth.user.college
  form.bio = auth.user.bio || ''
}

function loadProfile() {
  loading.value = true
  pageError.value = ''
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    try {
      if (auth.user && (!auth.user.name || !auth.user.studentNo)) {
        throw new Error('missing profile fields')
      }
      fillForm()
    } catch {
      pageError.value = '个人资料加载失败，可能是本地演示数据不完整。重新登录后可恢复。'
    } finally {
      loading.value = false
    }
  }, 260)
}

onMounted(loadProfile)
onBeforeUnmount(() => {
  window.clearTimeout(timer)
  revokeAvatarPreview()
})

watch(prefs, () => saveState(PREFS_KEY, { ...prefs }), { deep: true })

async function saveProfile() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await auth.updateProfile({
      name: form.name.trim(),
      college: form.college,
      bio: form.bio.trim(),
    })
    fillForm()
    ElMessage.success('个人资料已同步到后端数据库')
  } catch (error) {
    ElMessage.error(error?.message || '个人资料保存失败')
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  if (!passwordFormRef.value || savingPassword.value) return
  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }
  savingPassword.value = true
  try {
    await auth.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordFormRef.value.clearValidate()
    ElMessage.success('密码已修改')
  } catch (error) {
    ElMessage.error(error?.message || '密码修改失败')
  } finally {
    savingPassword.value = false
  }
}

function resetForm() {
  fillForm()
  formRef.value?.clearValidate()
}

function revokeAvatarPreview() {
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatarPreview.value = ''
}

function chooseAvatar() {
  avatarInput.value?.click()
}

function onAvatarSelected(event) {
  const file = event.target?.files?.[0]
  if (event.target) event.target.value = ''
  if (!file) return
  if (!AVATAR_TYPES.includes(file.type)) {
    ElMessage.warning('头像仅支持 JPG、PNG 或 WebP 格式')
    return
  }
  if (file.size > MAX_AVATAR_BYTES) {
    ElMessage.warning('头像文件不能超过 5 MB')
    return
  }
  revokeAvatarPreview()
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
}

function cancelAvatarChange() {
  revokeAvatarPreview()
  avatarFile.value = null
}

async function saveAvatar() {
  if (!avatarFile.value || avatarUploading.value) return
  avatarUploading.value = true
  try {
    const uploaded = await uploadImage(avatarFile.value, {
      maxEdge: 512,
      quality: 0.84,
    })
    await auth.updateProfile({ avatarUrl: uploaded.path || uploaded.url })
    avatars.upsert(auth.user)
    avatars.refresh()
    cancelAvatarChange()
    ElMessage.success('头像已更新')
  } catch (error) {
    ElMessage.error(error?.message || '头像保存失败')
  } finally {
    avatarUploading.value = false
  }
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('退出后需要重新登录，云端共享数据仍保留在服务器。', '退出登录', {
      confirmButtonText: '退出登录',
      cancelButtonText: '再想想',
      type: 'warning',
    })
  } catch {
    return
  }
  await auth.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      '将清空本机缓存、登录状态与偏好设置，并重新从云端拉取共享数据。此操作不可撤销。',
      '重置演示数据',
      {
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  await auth.logout()
  resetAll()
  ElMessage.success('已重置，正在刷新页面…')
  window.setTimeout(() => window.location.reload(), 650)
}
</script>

<template>
  <div class="page pf">
    <PageHeader
      eyebrow="个人中心"
      title="个人资料"
      desc="管理你的校园身份信息与通知偏好，账号资料由后端服务统一校验和保存。"
    >
      <template #meta>
        <div v-if="auth.user" class="row wrap gap-2">
          <span class="tag-soft tag-soft--brand">{{ auth.user.role }}</span>
          <span class="tag-soft">后端账号</span>
        </div>
      </template>
    </PageHeader>

    <div v-if="loading" class="card card--pad-lg">
      <el-skeleton :rows="8" animated />
    </div>

    <div v-else-if="pageError" class="card card--pad-lg pf-state">
      <div class="pf-state__icon pf-state__icon--coral">
        <el-icon><WarningFilled /></el-icon>
      </div>
      <h3>资料加载失败</h3>
      <p>{{ pageError }}</p>
      <div class="row gap-3">
        <el-button type="primary" @click="loadProfile">重新加载</el-button>
        <el-button plain @click="router.push('/login?redirect=/profile')">重新登录</el-button>
      </div>
    </div>

    <div v-else-if="!auth.user" class="card card--pad-lg">
      <EmptyState
        title="还没有登录"
        desc="登录后可以查看并编辑个人资料、管理通知偏好。"
      >
        <template #icon>
          <el-icon><User /></el-icon>
        </template>
        <el-button type="primary" @click="router.push('/login?redirect=/profile')">
          去登录
        </el-button>
      </EmptyState>
    </div>

    <template v-else>
      <section class="pf-hero">
        <div class="pf-hero__main">
          <div class="pf-avatar-wrap">
            <UserAvatar
              class="pf-avatar"
              :name="auth.user.name"
              :user-id="auth.user.id"
              :src="avatarDisplayUrl"
              prefer-src
              :size="96"
              :radius="4"
              :alt="`${auth.user.name}的头像`"
            />
            <span class="pf-avatar__status" title="账号状态正常">
              <el-icon><CircleCheck /></el-icon>
            </span>
          </div>

          <div class="pf-identity">
            <span class="pf-identity__eyebrow">校园身份</span>
            <div class="pf-identity__title">
              <h2>{{ auth.user.name }}</h2>
              <span class="tag-soft tag-soft--brand">{{ auth.user.role }}</span>
              <span v-if="auth.isAdmin" class="tag-soft tag-soft--amber">管理角色</span>
              <span class="tag-soft pf-source-tag">
                {{ auth.user.source === 'builtin' ? '内置演示账号' : '自建账号' }}
              </span>
            </div>
            <p class="pf-identity__college">
              <el-icon><School /></el-icon>
              {{ auth.user.college }}
            </p>
            <p class="pf-identity__bio">
              {{ auth.user.bio || '还没有填写个人简介，补充一句让同学更了解你。' }}
            </p>
            <div class="pf-avatar-actions">
              <el-button plain size="small" @click="chooseAvatar">
                <el-icon><Camera /></el-icon>
                更换头像
              </el-button>
              <el-button
                v-if="avatarFile"
                type="primary"
                size="small"
                :loading="avatarUploading"
                @click="saveAvatar"
              >
                保存头像
              </el-button>
              <el-button
                v-if="avatarFile"
                text
                size="small"
                :disabled="avatarUploading"
                @click="cancelAvatarChange"
              >
                取消
              </el-button>
              <span>{{ avatarFile?.name || 'JPG / PNG / WebP，最大 5 MB' }}</span>
            </div>
            <input
              ref="avatarInput"
              class="pf-avatar-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              @change="onAvatarSelected"
            />
          </div>

          <div class="pf-completion">
            <ProgressRing :value="completeness" :size="66" :stroke="6" tone="teal" />
            <div>
              <span>资料完整度</span>
              <strong>{{ completeness === 100 ? '资料已完整' : '继续完善' }}</strong>
              <small>{{ completeness === 100 ? '身份、专业和简介均已填写' : '补全身份与简介，提升 AI 文案贴合度' }}</small>
            </div>
          </div>
        </div>

        <div class="pf-hero__stats">
          <div class="pf-hero-stat">
            <span class="pf-hero-stat__icon"><el-icon><Postcard /></el-icon></span>
            <div>
              <span>学号（脱敏）</span>
              <strong class="mono">{{ auth.maskedNo }}</strong>
            </div>
          </div>
          <div class="pf-hero-stat">
            <span class="pf-hero-stat__icon"><el-icon><Calendar /></el-icon></span>
            <div>
              <span>加入校园智能调度平台</span>
              <strong>{{ fmtDate(auth.user.loginAt) }}</strong>
            </div>
          </div>
          <div class="pf-hero-stat">
            <span class="pf-hero-stat__icon"><el-icon><Lock /></el-icon></span>
            <div>
              <span>账号安全</span>
              <strong>登录状态正常</strong>
            </div>
          </div>
        </div>
      </section>

      <div class="grid g-7-5 pf-grid">
        <div class="pf-main">
          <SectionCard
            title="基本资料"
            desc="这些信息用于页面展示与 AI 文案的称呼，保存后会同步到服务器。"
          >
            <template #actions>
              <span class="pf-save-state" :class="{ 'is-dirty': dirty }">
                <span class="dot" :class="dirty ? 'dot--amber' : 'dot--teal'"></span>
                {{ dirty ? '有未保存的修改' : '资料已同步' }}
              </span>
            </template>

            <el-form
              ref="formRef"
              :model="form"
              :rules="rules"
              label-position="top"
              class="pf-form"
              @submit.prevent
            >
              <div class="pf-form__section">
                <div class="pf-form__section-title">
                  <span>01</span>
                  <div>
                    <strong>身份信息</strong>
                    <small>用于站内展示、通知称呼和 AI 文案生成</small>
                  </div>
                </div>
                <div class="grid g2">
                  <el-form-item label="姓名" prop="name">
                    <el-input
                      v-model="form.name"
                      maxlength="10"
                      show-word-limit
                      placeholder="请输入姓名"
                    />
                  </el-form-item>
                  <el-form-item label="专业方向" prop="college">
                    <el-select v-model="form.college" placeholder="请选择专业方向" class="pf-select">
                      <el-option
                        v-for="item in collegeOptions"
                        :key="item"
                        :label="item"
                        :value="item"
                      />
                    </el-select>
                  </el-form-item>
                </div>
              </div>

              <div class="pf-form__section">
                <div class="pf-form__section-title">
                  <span>02</span>
                  <div>
                    <strong>个人介绍</strong>
                    <small>一句话介绍兴趣、专业或你愿意提供的帮助</small>
                  </div>
                </div>
                <el-form-item label="个人简介" prop="bio">
                  <el-input
                    v-model="form.bio"
                    type="textarea"
                    :rows="3"
                    maxlength="60"
                    show-word-limit
                    resize="none"
                    placeholder="用一句话介绍自己，例如：爱拍照，也爱帮助同学"
                  />
                </el-form-item>
              </div>

              <div class="pf-form__section pf-form__section--locked">
                <div class="pf-form__section-title">
                  <span>03</span>
                  <div>
                    <strong>账号标识</strong>
                    <small>唯一标识由系统维护，避免账号混淆</small>
                  </div>
                </div>
                <el-form-item label="学号">
                  <el-input :model-value="auth.maskedNo" disabled class="mono" />
                  <p class="pf-form__hint">
                    学号是账号唯一标识，已脱敏展示；如需修改请联系高级管理员。
                  </p>
                </el-form-item>
              </div>

              <div class="pf-form__actions">
                <div class="pf-form__actions-copy">
                  <strong>{{ dirty ? '修改尚未保存' : '资料保持最新' }}</strong>
                  <span>{{ dirty ? '保存后立即同步到 SQLite 账号数据' : '最近一次保存已同步到后端' }}</span>
                </div>
                <el-button text :disabled="!dirty || saving" @click="resetForm">
                  撤销修改
                </el-button>
                <el-button
                  type="primary"
                  :loading="saving"
                  :disabled="!dirty"
                  @click="saveProfile"
                >
                  保存修改
                </el-button>
              </div>
            </el-form>
          </SectionCard>

          <SectionCard
            title="安全设置"
            desc="自建人物可以设置和修改自己的登录密码；内置演示账号使用统一密码。"
          >
            <div class="pf-security-head">
              <span class="pf-security-head__icon"><el-icon><Key /></el-icon></span>
              <div>
                <strong>登录密码</strong>
                <span>{{ auth.user.source === 'builtin' ? '内置账号密码由系统统一管理' : '建议定期更换密码，不要与其他网站共用' }}</span>
              </div>
              <span class="tag-soft tag-soft--teal">
                <span class="dot dot--teal"></span>
                受保护
              </span>
            </div>

            <el-alert
              v-if="auth.user.source === 'builtin'"
              title="内置演示账号密码统一为 123456"
              type="info"
              :closable="false"
              show-icon
            />
            <template v-else>
              <el-alert
                v-if="auth.user.mustChangePassword"
                title="当前账号正在使用迁移默认密码 123456，请尽快修改为自己的密码"
                type="warning"
                :closable="false"
                show-icon
                class="pf-password-alert"
              />
              <el-form
                ref="passwordFormRef"
                :model="passwordForm"
                :rules="passwordRules"
                label-position="top"
                class="pf-password-form"
                @submit.prevent
              >
                <el-form-item label="当前密码" prop="currentPassword">
                  <el-input
                    v-model="passwordForm.currentPassword"
                    type="password"
                    maxlength="32"
                    show-password
                    autocomplete="current-password"
                    :prefix-icon="Key"
                  />
                </el-form-item>
                <div class="grid g2">
                  <el-form-item label="新密码" prop="newPassword">
                    <el-input
                      v-model="passwordForm.newPassword"
                      type="password"
                      maxlength="32"
                      show-password
                      autocomplete="new-password"
                      placeholder="8–32 个字符"
                    />
                  </el-form-item>
                  <el-form-item label="确认新密码" prop="confirmPassword">
                    <el-input
                      v-model="passwordForm.confirmPassword"
                      type="password"
                      maxlength="32"
                      show-password
                      autocomplete="new-password"
                      placeholder="再次输入新密码"
                    />
                  </el-form-item>
                </div>
                <el-button type="primary" :loading="savingPassword" @click="changePassword">
                  修改密码
                </el-button>
              </el-form>
            </template>
          </SectionCard>
        </div>

        <aside class="pf-side">
          <section class="card card--pad pf-account">
            <div class="pf-account__head">
              <span class="pf-account__icon"><el-icon><User /></el-icon></span>
              <div>
                <h3>账户概览</h3>
                <p>身份与数据存储状态</p>
              </div>
              <span class="pf-account__status"><i></i>正常</span>
            </div>

            <dl class="pf-account__list">
              <div>
                <dt>账号类型</dt>
                <dd>{{ auth.user.source === 'builtin' ? '内置演示账号' : '自建账号' }}</dd>
              </div>
              <div>
                <dt>角色权限</dt>
                <dd>{{ auth.user.role }}</dd>
              </div>
              <div>
                <dt>账号 ID</dt>
                <dd class="mono pf-account__id" :title="auth.user.id">{{ auth.user.id }}</dd>
              </div>
              <div>
                <dt>数据存储</dt>
                <dd>SQLite 云端同步</dd>
              </div>
            </dl>

            <div class="pf-account__security">
              <span><el-icon><Lock /></el-icon></span>
              <div>
                <strong>会话已通过后端校验</strong>
                <small>通知与 AI 记录按账号隔离</small>
              </div>
            </div>

            <el-button plain class="pf-logout" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              退出当前账号
            </el-button>
          </section>

          <SectionCard
            title="通知偏好"
            desc="设置会立即保存在本机，并跟随当前浏览器。"
          >
            <div class="pf-prefs">
              <div v-for="item in prefItems" :key="item.key" class="pf-pref">
                <span class="pf-pref__icon">
                  <el-icon><component :is="item.icon" /></el-icon>
                </span>
                <div class="pf-pref__text">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.desc }}</span>
                </div>
                <el-switch v-model="prefs[item.key]" />
              </div>
            </div>
            <p class="pf-note">
              <span class="dot dot--teal"></span>
              演示版不会真正发送邮件或短信，开关仅影响本机演示状态。
            </p>
          </SectionCard>

          <SectionCard
            title="数据与演示环境"
            desc="服务器数据与本机缓存相互独立，可按需重置本机环境。"
          >
            <div class="pf-demo">
              <div class="pf-demo__row">
                <span>当前登录</span>
                <strong class="mono">{{ auth.maskedNo }}</strong>
              </div>
              <div class="pf-demo__row">
                <span>通知偏好</span>
                <strong>{{ prefs.inApp ? '站内通知开' : '站内通知关' }} · {{ prefs.important ? '重要提醒开' : '重要提醒关' }}</strong>
              </div>
            </div>
            <div class="pf-demo__actions">
              <el-button type="danger" plain @click="handleReset">
                <el-icon><Refresh /></el-icon>
                重置本机数据
              </el-button>
              <span>服务器账号和已发布内容仍会保留</span>
            </div>
          </SectionCard>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pf {
  gap: 32px;
}
.pf-grid {
  align-items: start;
}
/* ---------- 右侧 ---------- */
.pf-main {
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-width: 0;
}
.pf-dirty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--amber-600, #b7791f);
}
.pf-form {
  margin-top: 0px;
}
.pf-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 600;
}
.pf-select {
  width: 100%;
}
.pf-form__hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}
.pf-form__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
.pf-password-alert {
  margin-bottom: 16px;
}
.pf-password-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 600;
}
.pf-password-form :deep(.el-form-item:last-of-type) {
  margin-bottom: 16px;
}
/* ---------- 偏好 ---------- */
.pf-prefs {
  display: flex;
  flex-direction: column;
}
.pf-pref {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.pf-pref:first-child {
  padding-top: 0px;
}
.pf-pref:last-child {
  border-bottom: 0;
  padding-bottom: 4px;
}
.pf-pref__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--brand-50, #eef2f5);
  color: var(--brand-500);
  font-size: 18px;
}
.pf-pref__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.pf-pref__text strong {
  font-size: 13px;
  color: var(--text-1);
}
.pf-pref__text span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.pf-pref :deep(.el-switch) {
  flex: none;
}
.pf-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.pf-note .dot {
  margin-top: 4px;
  flex: none;
}
/* ---------- 演示数据 ---------- */
.pf-demo {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}
.pf-demo__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.pf-demo__row:first-child {
  padding-top: 0;
}
.pf-demo__row span {
  color: var(--text-3);
}
.pf-demo__row strong {
  font-weight: 600;
  color: var(--text-1);
  text-align: right;
}
.pf-demo__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
/* ---------- 状态 ---------- */
.pf-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding-top: 48px;
  padding-bottom: 48px;
}
.pf-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 8px;
  font-size: 24px;
  background: var(--coral-50, #fff0ef);
  color: var(--coral-500);
  margin-bottom: 4px;
}
.pf-state h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-1);
}
.pf-state p {
  margin: 0 0 8px;
  max-width: 440px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}
@media (max-width: 1180px) {
  .pf-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .pf {
    gap: 24px;
  }
  .pf-form :deep(.grid.g2) {
    grid-template-columns: minmax(0, 1fr);
  }
  .pf-form__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .pf-form__actions :deep(.el-button) {
    margin-left: 0;
  }
  .pf-demo__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .pf-demo__actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
  .pf-pref {
    align-items: flex-start;
  }
}
/* ==========================================================================
   Profile v2 · identity-first layout
   ========================================================================== */
.pf {
  gap: 32px;
}
.pf-hero {
  position: relative;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.pf-hero__main {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 248px;
  align-items: center;
  gap: 32px;
  padding: 24px 0 32px;
}
.pf-avatar-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  flex: none;
}
.pf-avatar {
  width: 96px;
  height: 96px;
  margin: 0;
  border: 3px solid var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 1px var(--line-strong);
  color: var(--text-invert);
  font-family: var(--font-serif);
  font-size: var(--fs-3xl);
  font-weight: 600;
}
.pf-avatar__status {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 3px solid var(--bg);
  border-radius: 50%;
  color: var(--text-invert);
  background: var(--teal-600);
  font-size: 12px;
}
.pf-avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.pf-avatar-input {
  display: none;
}
.pf-avatar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.pf-avatar-actions :deep(.el-button) {
  margin-left: 0;
}
.pf-avatar-actions > span {
  max-width: 260px;
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-4);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-identity {
  min-width: 0;
}
.pf-identity__eyebrow {
  display: inline-flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-3);
}
.pf-identity__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pf-identity__title h2 {
  margin: 0 4px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(26px, 2.4vw, 32px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--text-1);
}
.pf-identity__title .tag-soft {
  border-color: var(--line);
  color: var(--text-2);
  background: var(--surface-2);
}
.pf-identity__title .tag-soft--brand {
  color: var(--brand-700);
  background: var(--brand-50);
}
.pf-identity__title .tag-soft--amber {
  color: var(--amber-700);
  background: var(--amber-50);
}
.pf-source-tag {
  color: var(--text-4) !important;
}
.pf-identity__college {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.pf-identity__college .el-icon {
  color: var(--text-4);
}
.pf-identity__bio {
  max-width: 56ch;
  margin: 8px 0 0;
  overflow: hidden;
  font-size: var(--fs-sm);
  line-height: 1.7;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}
.pf-completion {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.pf-completion :deep(.ring svg circle:first-of-type) {
  stroke: var(--line);
}
.pf-completion :deep(.ring__value) {
  color: var(--text-1);
}
.pf-completion :deep(.ring__value small) {
  color: var(--text-4);
}
.pf-completion > div:last-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pf-completion > div > span {
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  color: var(--text-3);
}
.pf-completion > div > strong {
  margin: 0px 0 4px;
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-1);
}
.pf-completion > div > small {
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--text-3);
}
.pf-hero__stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 0;
  border-top: 1px solid var(--line);
}
.pf-hero-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  padding-right: 16px;
}
.pf-hero-stat + .pf-hero-stat {
  padding-left: 16px;
  border-left: 1px solid var(--line);
}
.pf-hero-stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  background: var(--surface-2);
  font-size: 13px;
}
.pf-hero-stat > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pf-hero-stat > div > span {
  font-size: var(--fs-xs);
  letter-spacing: 0;
  color: var(--text-3);
}
.pf-hero-stat > div > strong {
  overflow: hidden;
  font-size: var(--fs-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
}
.pf-grid {
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.9fr);
  align-items: start;
  gap: 16px;
}
.pf-main {
  gap: 16px;
}
.pf-side {
  position: sticky;
  top: 82px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.pf-save-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--teal-600);
}
.pf-save-state.is-dirty {
  color: var(--amber-600, #b7791f);
}
.pf-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 0;
}
.pf-form__section + .pf-form__section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.pf-form__section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.pf-form__section-title > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  flex: none;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.pf-form__section-title > div {
  display: flex;
  flex-direction: column;
  gap: 0px;
}
.pf-form__section-title strong {
  font-size: 13px;
  color: var(--text-1);
}
.pf-form__section-title small {
  font-size: 12px;
  color: var(--text-3);
}
.pf-form :deep(.el-form-item) {
  margin-bottom: 16px;
}
.pf-form :deep(.el-form-item__label),
.pf-password-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.pf-form :deep(.el-input__wrapper),
.pf-form :deep(.el-select__wrapper),
.pf-password-form :deep(.el-input__wrapper) {
  min-height: 42px;
  border-radius: 8px;
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--line) inset;
  transition: background var(--dur), box-shadow var(--dur);
}
.pf-form :deep(.el-input__wrapper.is-focus),
.pf-form :deep(.el-select__wrapper.is-focused),
.pf-password-form :deep(.el-input__wrapper.is-focus) {
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--brand-300) inset;
}
.pf-form :deep(.el-textarea__inner) {
  min-height: 92px !important;
  padding: 12px 12px;
  border-radius: 8px;
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--line) inset;
  line-height: 1.7;
}
.pf-form :deep(.el-textarea__inner:focus) {
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--brand-300) inset;
}
.pf-form :deep(.el-input.is-disabled .el-input__wrapper) {
  background: var(--surface-3);
  box-shadow: none;
}
.pf-form__section--locked {
  padding-bottom: 0px !important;
}
.pf-form__section--locked .pf-form__section-title > span {
  background: var(--surface-3);
  color: var(--text-3);
}
.pf-form__hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
.pf-form__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin: 4px -24px -24px;
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  border-radius: 0 0 8px 8px;
  background: var(--surface-2);
}
.pf-form__actions-copy {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}
.pf-form__actions-copy strong {
  font-size: 12px;
  color: var(--text-2);
}
.pf-form__actions-copy span {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-4);
}
.pf-password-form {
  margin-top: 16px;
}
.pf-security-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}
.pf-security-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 8px;
  color: var(--brand-600);
  background: var(--brand-50);
  font-size: 18px;
}
.pf-security-head > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.pf-security-head > div strong {
  font-size: 12px;
  color: var(--text-1);
}
.pf-security-head > div span {
  font-size: 12px;
  color: var(--text-3);
}
.pf-account {
  position: relative;
  overflow: hidden;
}
.pf-account__head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pf-account__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 8px;
  color: #fff;
  background: var(--brand-600);
  box-shadow: none;
}
.pf-account__head > div {
  flex: 1;
  min-width: 0;
}
.pf-account__head h3 {
  margin: 0;
  font-size: 14px;
  color: var(--text-1);
}
.pf-account__head p {
  margin: 0px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.pf-account__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--teal-600);
}
.pf-account__status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--teal-500);
  box-shadow: none;
}
.pf-account__list {
  display: flex;
  flex-direction: column;
  margin: 16px 0 12px;
  padding: 4px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.pf-account__list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}
.pf-account__list dt {
  min-width: 64px;
  font-size: 12px;
  color: var(--text-3);
}
.pf-account__list dd {
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
}
.pf-account__id {
  max-width: 180px;
}
.pf-account__security {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 12px;
  border-radius: 8px;
  background: var(--teal-50);
  border: 1px solid rgba(18, 179, 166, 0.14);
}
.pf-account__security > span {
  color: var(--teal-600);
  font-size: 14px;
}
.pf-account__security > div {
  display: flex;
  flex-direction: column;
  gap: 0px;
}
.pf-account__security strong {
  font-size: 12px;
  color: var(--text-2);
}
.pf-account__security small {
  font-size: 12px;
  color: var(--text-3);
}
.pf-logout {
  width: 100%;
}
.pf-prefs {
  gap: 8px;
}
.pf-pref {
  gap: 12px;
  padding: 12px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}
.pf-pref:first-child,
.pf-pref:last-child {
  padding: 12px 12px;
  border-bottom: 1px solid var(--line);
}
.pf-pref__icon {
  width: 33px;
  height: 33px;
  border-radius: 8px;
  font-size: 14px;
}
.pf-pref__text strong {
  font-size: 12px;
}
.pf-pref__text span {
  font-size: 12px;
}
.pf-note {
  margin-top: 12px;
  font-size: 12px;
}
.pf-demo {
  margin-bottom: 12px;
}
.pf-demo__row {
  padding: 8px 0;
  font-size: 12px;
}
.pf-demo__actions {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.pf-demo__actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
.pf-demo__actions > span {
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--text-4);
}
@media (max-width: 1180px) {
  .pf-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .pf-side {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  .pf-account {
    grid-row: span 2;
  }
}
@media (max-width: 900px) {
  .pf-hero__main {
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 16px;
  }
  .pf-avatar-wrap,
  .pf-avatar {
    width: 86px;
    height: 86px;
  }
  .pf-completion {
    grid-column: 1 / -1;
    width: 100%;
    padding: 12px 12px;
  }
  .pf-hero__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .pf-hero__stamp {
    display: none;
  }
}
@media (max-width: 720px) {
  .pf-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .pf-account {
    grid-row: auto;
  }
}
@media (max-width: 640px) {
  .pf-hero {
    padding: 16px 16px 0;
    border-radius: 8px;
  }
  .pf-hero__main {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
  }
  .pf-avatar-wrap,
  .pf-avatar {
    width: 72px;
    height: 72px;
  }
  .pf-avatar {
    border-width: 3px;
    border-radius: 8px;
    font-size: 28px;
  }
  .pf-avatar__status {
    right: -4px;
    bottom: -4px;
    width: 24px;
    height: 24px;
    border-width: 3px;
  }
  .pf-identity__eyebrow {
    margin-bottom: 4px;
    font-size: 12px;
  }
  .pf-identity__title {
    gap: 4px;
  }
  .pf-identity__title h2 {
    width: 100%;
    font-size: 24px;
  }
  .pf-identity__title .tag-soft {
    font-size: 12px;
  }
  .pf-source-tag {
    display: none;
  }
  .pf-identity__bio {
    max-width: 100%;
    font-size: 12px;
  }
  .pf-completion {
    gap: 12px;
  }
  .pf-completion > div > strong {
    font-size: 18px;
  }
  .pf-hero__stats {
    grid-template-columns: minmax(0, 1fr);
    margin-top: 16px;
  }
  .pf-hero-stat {
    min-height: 58px;
    padding-right: 0;
  }
  .pf-hero-stat + .pf-hero-stat {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .pf-form__section-title small {
    display: none;
  }
  .pf-form :deep(.grid.g2),
  .pf-password-form :deep(.grid.g2) {
    grid-template-columns: minmax(0, 1fr);
  }
  .pf-form__actions {
    flex-wrap: wrap;
    margin: 4px -16px -16px;
    padding: 12px 16px;
  }
  .pf-form__actions-copy {
    flex-basis: 100%;
  }
  .pf-form__actions :deep(.el-button) {
    flex: 0 0 calc(50% - 4px);
    width: calc(50% - 4px);
    margin-left: 0;
  }
  .pf-security-head {
    align-items: flex-start;
  }
  .pf-security-head > .tag-soft {
    display: none;
  }
}
</style>
