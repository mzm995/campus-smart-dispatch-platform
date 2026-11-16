<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Key,
  Lock,
  MagicStick,
  Postcard,
  User,
} from '@element-plus/icons-vue'
import AppLogo from '@/components/AppLogo.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useUserStore } from '@/stores/user'
import { apiRequest } from '@/utils/api'
import { DEMO_ROLE_ORDER } from '@/utils/demoTour'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

const formRef = ref()
const loading = ref(false)
const mode = ref('create')
const selectedAccount = ref(null)
const accountsLoading = ref(true)
const demoError = ref('')
const demoAccounts = ref([])
const studentNumbers = reactive({
  startNumber: '21040001',
  nextStudentNo: '21040001',
  availableCount: 0,
  allocatedCount: 0,
})
const form = reactive({
  name: '',
  password: '',
  confirmPassword: '',
  registrationCode: '',
})

const rules = {
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { max: 10, message: '姓名不能超过 10 个字', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const length = [...String(value || '')].length
        if (length > 32) callback(new Error('密码不能超过 32 个字符'))
        else if (mode.value === 'create' && length < 8) callback(new Error('新密码至少需要 8 个字符'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

const pageTitle = computed(() =>
  mode.value === 'create' ? '创建账号' : '登录账号',
)
const pageSubtitle = computed(() =>
  mode.value === 'create'
    ? '填写基本信息，立即进入 AI 调度工作台。'
    : '输入当前账号密码，继续使用工作台。',
)
const quickAccounts = computed(() =>
  demoAccounts.value
    .filter((account) => account.source === 'builtin')
    .slice()
    .sort(
      (left, right) =>
        DEMO_ROLE_ORDER.indexOf(left.roleKey) -
        DEMO_ROLE_ORDER.indexOf(right.roleKey),
    ),
)

const demoHint = reactive({ index: -1 })

function selectAccount(account, index) {
  mode.value = 'login'
  selectedAccount.value = account
  form.password = ''
  form.confirmPassword = ''
  form.registrationCode = ''
  demoHint.index = index
  formRef.value?.clearValidate()
}

function backToCreate() {
  mode.value = 'create'
  selectedAccount.value = null
  demoHint.index = -1
  form.password = ''
  form.confirmPassword = ''
  formRef.value?.clearValidate()
}

async function submit() {
  if (loading.value || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    if (mode.value === 'create') {
      const data = await user.createPerson(
        form.name.trim(),
        form.password,
        form.registrationCode,
      )
      demoAccounts.value = data.accounts || demoAccounts.value
      Object.assign(studentNumbers, data.studentNumbers || {})
      form.name = ''
      form.password = ''
      form.confirmPassword = ''
      form.registrationCode = ''
      demoHint.index = -1
      formRef.value.clearValidate()
      ElMessage.success(
        `人物已创建，学号 ${data.user.studentNo} 已固定在右侧，点击账号后可输入密码进入`,
      )
      return
    }

    if (!selectedAccount.value) {
      ElMessage.warning('请先从右侧选择账号')
      return
    }
    await user.login({
      studentNo: selectedAccount.value.studentNo,
      name: selectedAccount.value.name,
      password: form.password,
    })
    ElMessage.success(`欢迎回来，${user.user.name}`)
    if (user.user.mustChangePassword) {
      ElMessage.warning('当前仍在使用迁移默认密码，请到个人资料页修改')
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (error) {
    ElMessage.error(error?.message || '登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function quickLogin(account) {
  if (loading.value) return
  loading.value = true
  try {
    await user.loginDemo(account, '123456')
    ElMessage.success(`已进入${account.role}演示视角`)
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (error) {
    ElMessage.error(error?.message || '快速进入失败')
  } finally {
    loading.value = false
  }
}

// 输入法组合期间的回车只用于选词，不触发登录
function onEnter(event) {
  if (event.isComposing) return
  submit()
}

async function loadDemoAccounts() {
  accountsLoading.value = true
  demoError.value = ''
  try {
    const data = await apiRequest('/auth/demo-accounts', { auth: false })
    demoAccounts.value = data.accounts || []
    Object.assign(studentNumbers, data.studentNumbers || {})
  } catch (error) {
    demoError.value = error?.message || '演示账号加载失败'
  } finally {
    accountsLoading.value = false
  }
}

onMounted(loadDemoAccounts)
</script>

<template>
  <div class="login">

    <div class="login__shell">
      <main class="login__card">
        <!-- 左列：登录表单 -->
        <section class="login__main" aria-labelledby="login-title">
          <div class="login__topbar">
            <AppLogo :size="38" class="login__logo" />
            <span class="login__eyebrow">演示环境</span>
          </div>

          <div class="login__intro">
            <h1 id="login-title" class="login__title">{{ pageTitle }}</h1>
            <p class="login__subtitle">{{ pageSubtitle }}</p>
          </div>

          <div v-if="quickAccounts.length" class="login__quick">
            <div class="login__quick-head">
              <span>快速演示</span>
              <small>免密进入</small>
            </div>
            <div class="login__quick-grid">
              <button
                v-for="account in quickAccounts"
                :key="`quick-${account.id}`"
                type="button"
                :disabled="loading"
                @click="quickLogin(account)"
              >
                <span>{{ account.role }}</span>
                <small>{{ account.name }}</small>
              </button>
            </div>
          </div>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            size="large"
            class="login__form"
            @submit.prevent="submit"
          >
            <template v-if="mode === 'create'">
              <el-form-item label="姓名" prop="name">
                <el-input
                  v-model="form.name"
                  placeholder="请输入姓名，最多 10 个字"
                  maxlength="10"
                  show-word-limit
                  autocomplete="name"
                  :prefix-icon="User"
                  clearable
                  @keyup.enter="onEnter"
                />
              </el-form-item>

              <div class="login__number">
                <el-icon class="login__number-icon"><Postcard /></el-icon>
                <span class="login__number-copy">
                  <span>自动分配学号</span>
                  <small>当前可用号段起始 {{ studentNumbers.startNumber }}</small>
                </span>
                <b class="login__number-value mono">{{ studentNumbers.nextStudentNo }}</b>
              </div>
            </template>

            <div v-else-if="selectedAccount" class="login__selected">
              <UserAvatar
                class="login__selected-avatar"
                :name="selectedAccount.name"
                :user-id="selectedAccount.id"
                :src="selectedAccount.avatarUrl"
                :size="38"
                :radius="12"
              />
              <span class="login__selected-copy">
                <strong>{{ selectedAccount.name }}</strong>
                <small class="mono">
                  {{ selectedAccount.studentNo }} · {{ selectedAccount.role }}
                </small>
              </span>
              <el-button text size="small" @click="backToCreate">
                <el-icon><ArrowLeft /></el-icon>
                返回创建
              </el-button>
            </div>

            <div :class="['login__field-grid', { 'is-single': mode !== 'create' }]">
              <el-form-item label="密码" prop="password">
                <el-input
                  v-model="form.password"
                  type="password"
                  :placeholder="mode === 'create' ? '设置 8–32 位密码' : '输入账号密码'"
                  maxlength="32"
                  show-password
                  :autocomplete="mode === 'create' ? 'new-password' : 'current-password'"
                  :prefix-icon="Key"
                  @keyup.enter="onEnter"
                />
              </el-form-item>

              <el-form-item v-if="mode === 'create'" label="确认密码" prop="confirmPassword">
                <el-input
                  v-model="form.confirmPassword"
                  type="password"
                  placeholder="再次输入密码"
                  maxlength="32"
                  show-password
                  autocomplete="new-password"
                  :prefix-icon="Lock"
                  @keyup.enter="onEnter"
                />
              </el-form-item>
            </div>

            <details v-if="mode === 'create'" class="login__invite">
              <summary>有邀请码？展开填写</summary>
              <el-form-item prop="registrationCode">
                <el-input
                  v-model="form.registrationCode"
                  maxlength="64"
                  placeholder="管理员提供的邀请码"
                  :prefix-icon="Lock"
                />
              </el-form-item>
            </details>

            <p class="login__server-note">
              <template v-if="mode === 'create'">
                姓名唯一，密码至少 8 位并以加盐哈希保存。
              </template>
              <template v-else>
                内置账号演示密码为 <b>123456</b>。
              </template>
            </p>

            <el-button
              type="primary"
              size="large"
              class="login__submit"
              :loading="loading"
              @click="submit"
            >
              {{ mode === 'create' ? '创建人物' : '登录账号' }}
              <el-icon v-if="!loading" class="login__submit-icon"><ArrowRight /></el-icon>
            </el-button>
          </el-form>

          <p class="login__privacy">
            <el-icon class="login__privacy-icon"><Lock /></el-icon>
            <span>账号、学号与权限均由后端安全校验。</span>
          </p>
        </section>

        <!-- 右列：固定人物列表 -->
        <aside class="login__demo" aria-labelledby="demo-title">
          <div class="login__demo-head">
            <div class="login__demo-heading">
              <span class="login__demo-orb" aria-hidden="true">
                <el-icon :size="14"><MagicStick /></el-icon>
              </span>
              <h2 id="demo-title" class="login__demo-title">人物账号</h2>
            </div>
            <span class="tag-soft tag-soft--brand login__demo-tag">
              {{ demoAccounts.length }} 人
            </span>
          </div>
          <p class="login__demo-desc">
            选择账号后输入密码，或使用上方快速演示入口
          </p>

          <div v-if="accountsLoading" class="login__accounts login__accounts--state">
            <el-skeleton :rows="4" animated />
          </div>

          <div v-else-if="demoError" class="login__accounts login__accounts--state">
            <el-empty :image-size="62" description="后端演示账号加载失败">
              <el-button plain size="small" @click="loadDemoAccounts">重新加载</el-button>
            </el-empty>
          </div>

          <div v-else class="login__accounts">
            <button
              v-for="(account, index) in demoAccounts"
              :key="account.id || account.studentNo"
              type="button"
              class="login__account"
              :class="{ 'is-active': demoHint.index === index }"
              :disabled="loading"
              @click="selectAccount(account, index)"
            >
              <UserAvatar
                class="login__avatar"
                :name="account.name || '校'"
                :user-id="account.id"
                :src="account.avatarUrl"
                :size="36"
                :radius="4"
                alt=""
              />

              <span class="login__account-meta">
                <span class="login__account-line">
                  <span class="login__account-name">{{ account.name }}</span>
                  <span class="login__role" :class="`login__role--${index % 4}`">{{
                    account.role
                  }}</span>
                  <span v-if="account.source === 'custom'" class="login__custom-tag">自建</span>
                </span>
                <span class="login__account-info">
                  <span>{{ account.studentNo }}</span>
                  <span v-if="account.college" class="login__account-college"> · {{ account.college }}</span>
                </span>
              </span>

              <el-icon class="login__account-icon">
                <ArrowRight />
              </el-icon>
            </button>
          </div>

          <div class="login__demo-foot">
            <p class="login__demo-note">
              内置演示账号密码均为 <b>123456</b>
            </p>
          </div>
        </aside>
      </main>

      <p class="login__page-foot">校园智能调度平台 · 演示环境</p>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   登录页：浅色背景 + 居中双列卡片
   ========================================================================== */
.login {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 32px clamp(16px, 3vw, 32px);
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg);
}

/* ---------- 卡片骨架 ---------- */
.login__shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1120px;
}

.login__card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
  height: min(700px, calc(100dvh - 64px));
  min-height: 620px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow: none;
  animation: fade-up 0.45s var(--ease-out) both;
}

/* ==========================================================================
   左列：登录表单
   ========================================================================== */
.login__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 32px clamp(24px, 3vw, 32px) 32px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
  background: var(--surface);
}

.login__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.login__logo {
  flex: none;
}

.login__eyebrow {
  padding: 0;
  border: none;
  border-radius: 0;
  color: var(--brand-600);
  background: none;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
}

.login__intro {
  margin-top: 16px;
}

.login__title {
  font-family: var(--font-serif);
  font-size: clamp(28px, 2.6vw, 34px);
  font-weight: 500;
  line-height: 1.28;
  letter-spacing: 0;
  color: var(--text-1);
}

.login__subtitle {
  margin-top: 8px;
  font-size: var(--fs-sm);
  line-height: 1.65;
  color: var(--text-3);
}

.login__quick {
  margin: 16px 0 4px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  box-shadow: none;
}

.login__quick-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.login__quick-head span {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-2);
}

.login__quick-head small {
  font-size: 12px;
  color: var(--text-3);
}

.login__quick-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.login__quick-grid button {
  display: flex;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
  padding: 8px 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}

.login__quick-grid button:hover {
  border-color: var(--brand-300);
  box-shadow: var(--shadow-xs);
}

.login__quick-grid button span {
  overflow: hidden;
  font-size: var(--fs-xs);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
}

.login__quick-grid button small {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}

.login__form {
  margin-top: 16px;
}

.login__form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.login__form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.login__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.login__field-grid.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.login__number {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -2px 0 12px;
  padding: 8px 12px;
  border: 1px solid var(--brand-100);
  border-radius: var(--radius-sm);
  background: var(--brand-50);
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--text-3);
}

.login__number-icon {
  flex: none;
  font-size: 13px;
  color: var(--brand-500);
}

.login__number-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
}

.login__number-copy small {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.login__number-value {
  flex: none;
  margin-left: auto;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--brand-600);
}

.login__selected {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -2px 0 12px;
  padding: 8px 12px;
  border: 1px solid var(--brand-100);
  border-radius: var(--radius);
  background: var(--brand-50);
}

.login__selected-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.login__selected-avatar img,
.login__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login__selected-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.login__selected-copy strong {
  font-size: var(--fs-sm);
  color: var(--text-1);
}

.login__selected-copy small {
  overflow: hidden;
  font-size: 12px;
  color: var(--text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login__selected :deep(.el-button) {
  flex: none;
  margin-left: auto;
}

.login__server-note {
  margin: -3px 0 12px;
  padding: 0 0px;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-3);
}

.login__invite {
  margin: -2px 0 8px;
  color: var(--text-3);
  font-size: var(--fs-xs);
}

.login__invite summary {
  width: fit-content;
  margin-bottom: 8px;
  color: var(--brand-600);
  font-weight: 600;
  cursor: pointer;
}

.login__invite :deep(.el-form-item) {
  margin-bottom: 8px;
}

.login__submit {
  width: 100%;
  height: 44px;
  margin-top: 0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.login__submit-icon {
  margin-left: 4px;
  font-size: 13px;
  transition: transform var(--dur) var(--ease-out);
}

.login__submit:hover .login__submit-icon {
  transform: translateX(3px);
}

.login__privacy {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-3);
}

.login__privacy-icon {
  flex: none;
  margin-top: 4px;
  font-size: 12px;
}

/* ==========================================================================
   右列：演示账号面板
   ========================================================================== */
.login__demo {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  height: 100%;
  padding: 32px 32px 24px;
  border-left: 1px solid var(--line);
  background: var(--surface-2);
}

.login__demo > * {
  position: relative;
  z-index: 1;
}

.login__demo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.login__demo-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.login__demo-orb {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-invert);
  background: var(--brand-600);
}

.login__demo-title {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-1);
}

.login__demo-tag {
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.login__demo-desc {
  margin-top: 4px;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-3);
}

/* ---------- 账号列表 ---------- */
.login__accounts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 12px;
  min-height: 0;
  max-height: calc(100% - 100px);
  padding-right: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.login__accounts--state {
  min-height: 250px;
  justify-content: center;
}

.login__accounts--state :deep(.el-empty) {
  padding: 16px 0;
}

.login__account {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.login__account:hover:not(:disabled),
.login__account.is-active {
  border-color: var(--brand-300);
  background: #fff;
  box-shadow: var(--shadow-xs);
}

.login__account.is-pending {
  border-color: var(--brand-300);
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--brand-200);
}

.login__account:disabled {
  cursor: default;
}

.login__account:disabled:not(.is-pending) {
  opacity: 0.55;
}

.login__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.login__account-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0px;
  min-width: 0;
}

.login__account-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.login__account-name {
  overflow: hidden;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.login__role {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
}

.login__role--1 {
  background: var(--teal-50);
  color: var(--teal-600);
}

.login__role--2 {
  background: var(--amber-50);
  color: var(--amber-600);
}

.login__role--3 {
  background: var(--coral-50);
  color: var(--coral-600);
}

.login__custom-tag {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--teal-50);
  color: var(--teal-600);
  font-size: 12px;
  font-weight: 600;
}

.login__account-info {
  overflow: hidden;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.login__account-icon {
  flex: none;
  font-size: 13px;
  color: var(--text-4);
  transition:
    color var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}

.login__account:hover:not(:disabled) .login__account-icon {
  color: var(--brand-500);
  transform: translateX(2px);
}

.login__account-icon.is-spin {
  color: var(--brand-500);
  animation: login-spin 0.8s linear infinite;
}

@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- 面板底部说明 ---------- */
.login__demo-foot {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.login__demo-note {
  margin: 0;
  font-size: var(--fs-xs);
  letter-spacing: 0;
  color: var(--text-3);
}

.login__page-foot {
  margin-top: 12px;
  font-size: 12px;
  letter-spacing: 0;
  text-align: center;
  color: var(--text-4);
}

/* ==========================================================================
   响应式
   ========================================================================== */
@media (max-height: 850px) and (min-width: 901px) {
  .login {
    align-items: flex-start;
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .login__main {
    padding-top: 24px;
    padding-bottom: 16px;
  }

  .login__intro {
    margin-top: 16px;
  }

  .login__form {
    margin-top: 12px;
  }

  .login__form :deep(.el-form-item) {
    margin-bottom: 8px;
  }

  .login__number,
  .login__selected {
    margin-bottom: 12px;
  }

  .login__server-note {
    margin-bottom: 12px;
  }

  .login__privacy {
    margin-top: 8px;
  }

  .login__demo {
    padding-top: 24px;
    padding-bottom: 16px;
  }

  .login__accounts {
    margin-top: 12px;
  }

  .login__demo-foot {
    padding-top: 8px;
  }
}

/* 900–1180：保持双列，整体收紧 */
@media (max-width: 1180px) {
  .login__main {
    padding: 32px 32px 24px;
  }

  .login__demo {
    padding: 32px 24px 24px;
  }

  .login__intro {
    margin-top: 24px;
  }

  .login__form {
    margin-top: 24px;
  }

  .login__account {
    gap: 8px;
    padding: 8px 12px;
  }

  .login__avatar {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    font-size: 14px;
  }
}

/* ≤900：单列，演示账号面板在表单下方 */
@media (max-width: 900px) {
  .login {
    align-items: flex-start;
    padding-top: 16px;
    padding-bottom: 24px;
  }

  .login__card {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    min-height: 0;
    max-width: 580px;
    margin: 0 auto;
  }

  .login__main {
    padding: 24px 24px 24px;
    overflow: visible;
  }

  .login__demo {
    height: auto;
    padding: 24px 24px 24px;
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .login__intro {
    margin-top: 16px;
  }

  .login__privacy {
    margin-top: 0;
    padding-top: 12px;
  }

  .login__demo-foot {
    padding-top: 12px;
  }

  .login__accounts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
    overflow: visible;
  }
}

/* ≤640：内边距收紧、按钮全宽 */
@media (max-width: 640px) {
  .login {
    padding: 12px 12px 24px;
  }

  .login__card {
    border-radius: var(--radius-lg);
  }

  .login__main {
    padding: 24px 16px 16px;
  }

  .login__demo {
    padding: 24px 16px 24px;
  }

  .login__title {
    font-size: 24px;
  }

  .login__subtitle {
    font-size: var(--fs-xs);
  }

  .login__form {
    margin-top: 16px;
  }

  .login__form :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  .login__quick-head {
    align-items: center;
    flex-direction: row;
  }

  .login__quick-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .login__quick-grid button span {
    font-size: 12px;
    letter-spacing: 0;
  }

  .login__quick-grid button small {
    font-size: 12px;
  }

  .login__field-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .login__number {
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-bottom: 16px;
  }

  .login__number-value {
    margin-left: auto;
  }

  .login__submit {
    width: 100%;
  }

  .login__account {
    gap: 8px;
    padding: 8px;
  }

  .login__avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 12px;
  }

  .login__account-icon {
    display: none;
  }

  .login__account-line {
    gap: 4px;
  }

  .login__account-name {
    font-size: 12px;
  }

  .login__role,
  .login__custom-tag {
    height: 18px;
    padding: 0 4px;
    font-size: 12px;
  }

  .login__account-info {
    font-size: 12px;
  }

  .login__account-college {
    display: none;
  }

  .login__demo-tag {
    height: 21px;
    padding: 0 8px;
  }

  .login__page-foot {
    margin-top: 12px;
    font-size: 12px;
  }
}
</style>
