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
      eyebrow="ACCOUNT · 个人中心"
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
        <span class="pf-hero__mesh" aria-hidden="true"></span>
        <span class="pf-hero__orb pf-hero__orb--a" aria-hidden="true"></span>
        <span class="pf-hero__orb pf-hero__orb--b" aria-hidden="true"></span>

        <div class="pf-hero__main">
          <div class="pf-avatar-wrap">
            <UserAvatar
              class="pf-avatar"
              :name="auth.user.name"
              :user-id="auth.user.id"
              :src="avatarDisplayUrl"
              prefer-src
              :size="96"
              :radius="30"
              :alt="`${auth.user.name}的头像`"
            />
            <span class="pf-avatar__status" title="账号状态正常">
              <el-icon><CircleCheck /></el-icon>
            </span>
          </div>

          <div class="pf-identity">
            <span class="pf-identity__eyebrow">CAMPUS IDENTITY · 校园身份</span>
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
          <span class="pf-hero__stamp">校园智能调度平台</span>
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
  gap: 20px;
}
.pf-grid {
  align-items: start;
}
/* ---------- 身份卡 ---------- */
.pf-id {
  overflow: hidden;
  align-self: start;
}
.pf-cover {
  position: relative;
  height: 96px;
  overflow: hidden;
  background:
    radial-gradient(280px 150px at 88% -10%, rgba(255, 255, 255, 0.34), transparent 62%),
    linear-gradient(120deg, #6c63ff 0%, #8b7dff 56%, #b7a9ff 100%);
}
.pf-cover__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.14) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(circle at 70% 40%, #000, transparent 82%);
  -webkit-mask-image: radial-gradient(circle at 70% 40%, #000, transparent 82%);
}
.pf-cover__tag {
  position: absolute;
  top: 14px;
  left: 20px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(17, 21, 39, 0.18);
  color: rgba(255, 255, 255, 0.88);
  font-size: 11px;
  letter-spacing: 0.04em;
  backdrop-filter: blur(6px);
}
.pf-cover__label {
  position: absolute;
  right: 20px;
  bottom: 14px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.62);
}
.pf-id__body {
  padding: 0 22px 22px;
}
.pf-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  margin-top: -44px;
  border-radius: 50%;
  border: 4px solid var(--surface);
  box-shadow: 0 10px 24px rgba(17, 21, 39, 0.14);
  color: #fff;
  font-size: 30px;
  font-weight: 750;
  letter-spacing: 0.02em;
}
.pf-name {
  margin: 12px 0 8px;
  font-size: 24px;
  font-weight: 760;
  letter-spacing: -0.02em;
  color: var(--text-1);
}
.pf-tags {
  margin-bottom: 10px;
}
.pf-college {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
.pf-college .el-icon {
  color: var(--text-3);
}
.pf-facts {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 18px;
  padding-top: 6px;
  border-top: 1px dashed var(--line);
}
.pf-fact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--line);
  font-size: 13px;
}
.pf-fact:last-child {
  border-bottom: 0;
}
.pf-fact__label {
  color: var(--text-3);
}
.pf-fact__value {
  color: var(--text-1);
  font-weight: 650;
}
.pf-bio {
  margin: 16px 0 18px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-2);
}
.pf-complete {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 14px;
  border-radius: var(--radius);
  background: linear-gradient(120deg, rgba(18, 179, 166, 0.08), rgba(108, 99, 255, 0.06));
  border: 1px solid rgba(18, 179, 166, 0.16);
}
.pf-complete__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pf-complete__text strong {
  font-size: 13px;
  color: var(--text-1);
}
.pf-complete__text span {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-3);
}
.pf-id__foot {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 18px;
}
.pf-logout {
  width: 100%;
}
.pf-id__hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-4);
}
/* ---------- 右侧 ---------- */
.pf-main {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.pf-dirty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--amber-600, #b7791f);
}
.pf-form {
  margin-top: -2px;
}
.pf-form :deep(.el-form-item__label) {
  font-size: 12.5px;
  color: var(--text-2);
  font-weight: 600;
}
.pf-select {
  width: 100%;
}
.pf-form__hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-3);
}
.pf-form__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}
.pf-password-alert {
  margin-bottom: 16px;
}
.pf-password-form :deep(.el-form-item__label) {
  font-size: 12.5px;
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
  gap: 13px;
  padding: 14px 0;
  border-bottom: 1px dashed var(--line);
}
.pf-pref:first-child {
  padding-top: 2px;
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
  border-radius: 11px;
  background: var(--brand-50, #f1f0ff);
  color: var(--brand-500);
  font-size: 17px;
}
.pf-pref__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.pf-pref__text strong {
  font-size: 13.5px;
  color: var(--text-1);
}
.pf-pref__text span {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}
.pf-pref :deep(.el-switch) {
  flex: none;
}
.pf-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}
.pf-note .dot {
  margin-top: 6px;
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
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px dashed var(--line);
  font-size: 12.5px;
}
.pf-demo__row:first-child {
  padding-top: 0;
}
.pf-demo__row span {
  color: var(--text-3);
}
.pf-demo__row strong {
  font-weight: 650;
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
  gap: 10px;
  text-align: center;
  padding-top: 44px;
  padding-bottom: 44px;
}
.pf-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  font-size: 24px;
  background: var(--coral-50, #fff0ef);
  color: var(--coral-500);
  margin-bottom: 4px;
}
.pf-state h3 {
  margin: 0;
  font-size: 17px;
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
    gap: 16px;
  }
  .pf-id__body {
    padding: 0 16px 18px;
  }
  .pf-cover {
    height: 84px;
  }
  .pf-avatar {
    width: 72px;
    height: 72px;
    margin-top: -38px;
    font-size: 26px;
  }
  .pf-name {
    font-size: 21px;
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
  gap: 18px;
}
.pf-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 26px 28px 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background:
    radial-gradient(460px 260px at 8% -20%, rgba(108, 99, 255, 0.54), transparent 65%),
    radial-gradient(420px 260px at 95% 12%, rgba(18, 179, 166, 0.24), transparent 68%),
    linear-gradient(135deg, #14182e 0%, #1a1d3b 58%, #151a2f 100%);
  box-shadow: 0 24px 52px -34px rgba(17, 21, 39, 0.82);
}
.pf-hero__mesh {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
}
.pf-hero__orb {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  filter: blur(2px);
  pointer-events: none;
}
.pf-hero__orb--a {
  top: -90px;
  left: 30%;
  width: 260px;
  height: 260px;
  background: rgba(139, 125, 255, 0.14);
}
.pf-hero__orb--b {
  right: 12%;
  bottom: 35px;
  width: 150px;
  height: 150px;
  background: rgba(18, 179, 166, 0.11);
}
.pf-hero__main {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 244px;
  align-items: center;
  gap: 22px;
  min-height: 132px;
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
  border: 4px solid rgba(255, 255, 255, 0.9);
  border-radius: 30px;
  box-shadow:
    0 20px 38px -18px rgba(0, 0, 0, 0.75),
    0 0 0 7px rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 34px;
  font-weight: 780;
}
.pf-avatar__status {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 4px solid #171b33;
  border-radius: 50%;
  color: #fff;
  background: var(--teal-500);
  font-size: 13px;
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
  gap: 7px;
  margin-top: 11px;
}
.pf-avatar-actions :deep(.el-button) {
  margin-left: 0;
}
.pf-avatar-actions > span {
  max-width: 210px;
  overflow: hidden;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-identity {
  min-width: 0;
}
.pf-identity__eyebrow {
  display: inline-flex;
  align-items: center;
  margin-bottom: 9px;
  font-size: 9.5px;
  font-weight: 750;
  letter-spacing: 0.17em;
  color: rgba(255, 255, 255, 0.45);
}
.pf-identity__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pf-identity__title h2 {
  margin: 0 4px 0 0;
  font-size: clamp(26px, 2.3vw, 34px);
  font-weight: 780;
  line-height: 1.05;
  letter-spacing: -0.035em;
  color: #fff;
}
.pf-identity__title .tag-soft {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.1);
}
.pf-identity__title .tag-soft--brand {
  color: #dcd9ff;
  background: rgba(108, 99, 255, 0.28);
}
.pf-identity__title .tag-soft--amber {
  color: #ffe2a8;
  background: rgba(245, 166, 35, 0.18);
}
.pf-source-tag {
  color: rgba(255, 255, 255, 0.58) !important;
}
.pf-identity__college {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 11px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.66);
}
.pf-identity__college .el-icon {
  color: rgba(255, 255, 255, 0.4);
}
.pf-identity__bio {
  max-width: 580px;
  margin: 9px 0 0;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.7;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.54);
}
.pf-completion {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 15px 16px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(10px);
}
.pf-completion :deep(.ring svg circle:first-of-type) {
  stroke: rgba(255, 255, 255, 0.12);
}
.pf-completion :deep(.ring__value) {
  color: #fff;
}
.pf-completion :deep(.ring__value small) {
  color: rgba(255, 255, 255, 0.48);
}
.pf-completion > div:last-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pf-completion > div > span {
  font-size: 10px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.46);
}
.pf-completion > div > strong {
  margin: 1px 0 3px;
  font-size: 19px;
  color: #fff;
}
.pf-completion > div > small {
  font-size: 10px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.44);
}
.pf-hero__stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: center;
  gap: 0;
  margin-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.pf-hero-stat {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding-right: 20px;
}
.pf-hero-stat + .pf-hero-stat {
  padding-left: 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.pf-hero-stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.68);
  background: rgba(255, 255, 255, 0.07);
  font-size: 14px;
}
.pf-hero-stat > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pf-hero-stat > div > span {
  font-size: 9.5px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.4);
}
.pf-hero-stat > div > strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.86);
}
.pf-hero__stamp {
  align-self: center;
  padding: 0 0 0 22px;
  font-size: 9px;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.23);
  white-space: nowrap;
}
.pf-grid {
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.9fr);
  align-items: start;
  gap: 18px;
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
  gap: 6px;
  font-size: 11px;
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
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.pf-form__section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.pf-form__section-title > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  flex: none;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 9px;
  font-weight: 760;
  letter-spacing: 0.05em;
}
.pf-form__section-title > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pf-form__section-title strong {
  font-size: 13px;
  color: var(--text-1);
}
.pf-form__section-title small {
  font-size: 10.5px;
  color: var(--text-3);
}
.pf-form :deep(.el-form-item) {
  margin-bottom: 16px;
}
.pf-form :deep(.el-form-item__label),
.pf-password-form :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-2);
}
.pf-form :deep(.el-input__wrapper),
.pf-form :deep(.el-select__wrapper),
.pf-password-form :deep(.el-input__wrapper) {
  min-height: 42px;
  border-radius: 11px;
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
  padding: 12px 14px;
  border-radius: 11px;
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
  padding-bottom: 2px !important;
}
.pf-form__section--locked .pf-form__section-title > span {
  background: var(--surface-3);
  color: var(--text-3);
}
.pf-form__hint {
  margin: 7px 0 0;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-3);
}
.pf-form__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin: 4px -24px -24px;
  padding: 15px 24px;
  border-top: 1px solid var(--line);
  border-radius: 0 0 18px 18px;
  background: var(--surface-2);
}
.pf-form__actions-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.pf-form__actions-copy strong {
  font-size: 11.5px;
  color: var(--text-2);
}
.pf-form__actions-copy span {
  overflow: hidden;
  font-size: 10px;
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
  margin-bottom: 14px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface-2);
}
.pf-security-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: var(--brand-600);
  background: var(--brand-50);
  font-size: 17px;
}
.pf-security-head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.pf-security-head > div strong {
  font-size: 12.5px;
  color: var(--text-1);
}
.pf-security-head > div span {
  font-size: 10.5px;
  color: var(--text-3);
}
.pf-account {
  position: relative;
  overflow: hidden;
}
.pf-account::before {
  content: "";
  position: absolute;
  top: -80px;
  right: -70px;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(108, 99, 255, 0.12), transparent 68%);
  pointer-events: none;
}
.pf-account__head {
  display: flex;
  align-items: center;
  gap: 11px;
}
.pf-account__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-500), #8b7dff);
  box-shadow: 0 10px 22px -14px rgba(108, 99, 255, 0.9);
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
  margin: 2px 0 0;
  font-size: 10.5px;
  color: var(--text-3);
}
.pf-account__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 650;
  color: var(--teal-600);
}
.pf-account__status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--teal-500);
  box-shadow: 0 0 0 4px rgba(18, 179, 166, 0.1);
}
.pf-account__list {
  display: flex;
  flex-direction: column;
  margin: 17px 0 14px;
  padding: 3px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.pf-account__list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 0;
}
.pf-account__list dt {
  min-width: 64px;
  font-size: 10.5px;
  color: var(--text-3);
}
.pf-account__list dd {
  margin: 0;
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 650;
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
  gap: 10px;
  margin-bottom: 15px;
  padding: 11px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(18, 179, 166, 0.08), rgba(108, 99, 255, 0.05));
  border: 1px solid rgba(18, 179, 166, 0.14);
}
.pf-account__security > span {
  color: var(--teal-600);
  font-size: 15px;
}
.pf-account__security > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pf-account__security strong {
  font-size: 10.5px;
  color: var(--text-2);
}
.pf-account__security small {
  font-size: 9.5px;
  color: var(--text-3);
}
.pf-logout {
  width: 100%;
}
.pf-prefs {
  gap: 8px;
}
.pf-pref {
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2);
}
.pf-pref:first-child,
.pf-pref:last-child {
  padding: 11px 12px;
  border-bottom: 1px solid var(--line);
}
.pf-pref__icon {
  width: 33px;
  height: 33px;
  border-radius: 10px;
  font-size: 15px;
}
.pf-pref__text strong {
  font-size: 12px;
}
.pf-pref__text span {
  font-size: 10px;
}
.pf-note {
  margin-top: 11px;
  font-size: 10px;
}
.pf-demo {
  margin-bottom: 13px;
}
.pf-demo__row {
  padding: 9px 0;
  font-size: 11px;
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
  font-size: 9.5px;
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
    gap: 18px;
  }
  .pf-avatar-wrap,
  .pf-avatar {
    width: 86px;
    height: 86px;
  }
  .pf-completion {
    grid-column: 1 / -1;
    width: 100%;
    padding: 12px 14px;
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
    padding: 20px 17px 0;
    border-radius: 18px;
  }
  .pf-hero__main {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 14px;
  }
  .pf-avatar-wrap,
  .pf-avatar {
    width: 72px;
    height: 72px;
  }
  .pf-avatar {
    border-width: 3px;
    border-radius: 22px;
    font-size: 27px;
  }
  .pf-avatar__status {
    right: -4px;
    bottom: -4px;
    width: 24px;
    height: 24px;
    border-width: 3px;
  }
  .pf-identity__eyebrow {
    margin-bottom: 6px;
    font-size: 8.5px;
  }
  .pf-identity__title {
    gap: 6px;
  }
  .pf-identity__title h2 {
    width: 100%;
    font-size: 25px;
  }
  .pf-identity__title .tag-soft {
    font-size: 9.5px;
  }
  .pf-source-tag {
    display: none;
  }
  .pf-identity__bio {
    max-width: 100%;
    font-size: 11px;
  }
  .pf-completion {
    gap: 12px;
  }
  .pf-completion > div > strong {
    font-size: 17px;
  }
  .pf-hero__stats {
    grid-template-columns: minmax(0, 1fr);
    margin-top: 18px;
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
    margin: 4px -18px -18px;
    padding: 14px 18px;
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
