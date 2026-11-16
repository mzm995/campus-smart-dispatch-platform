<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  Reading,
  SwitchButton,
  WarningFilled,
} from '@element-plus/icons-vue'
import { apiRequest, setAuthToken } from '@/utils/api'
import { clearBusinessState, saveState } from '@/utils/storage'
import { suspendCloudSync } from '@/utils/cloudSync'
import { DEMO_TOURS } from '@/utils/demoTour'
import { useGroupBuyStore } from '@/stores/groupbuy'
import { useLostfoundStore } from '@/stores/lostfound'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const user = useUserStore()
const groupbuy = useGroupBuyStore()
const lostfound = useLostfoundStore()
const tours = DEMO_TOURS
const activeTourKey = ref(tours[0].key)
const stepIndex = ref(0)
const switching = ref(false)
const accounts = ref([])

const activeTour = computed(
  () => tours.find((tour) => tour.key === activeTourKey.value) || tours[0],
)
const activeStep = computed(
  () => activeTour.value.steps[stepIndex.value] || activeTour.value.steps[0],
)
const accountByRole = computed(
  () =>
    new Map(
      accounts.value
        .filter((account) => account.source === 'builtin')
        .map((account) => [account.roleKey, account]),
    ),
)
const currentRoleLabel = computed(() => user.user?.role || '未登录')
const demoStateWarning = computed(() => {
  if (activeTourKey.value === 'groupbuy') {
    const status = groupbuy.getById('gb_002')?.errand?.status
    if (status && status !== 'open') {
      return `当前纸箱跑腿状态为“${status}”，不是演示所需的“待接单”。`
    }
  }
  if (activeTourKey.value === 'lostfound') {
    const found = lostfound.posts.find((post) => post.id === 'lf_001')
    const claim = found?.claims?.find((item) => item.id === 'claim_seed_found_001')
    if (claim && claim.status !== 'approved') {
      return `当前水杯认领状态为“${claim.status}”，不是演示所需的“已通过待确认”。`
    }
  }
  return ''
})

async function loadAccounts() {
  if (accounts.value.length) return
  try {
    const data = await apiRequest('/auth/demo-accounts', { auth: false })
    accounts.value = data.accounts || []
  } catch {
    accounts.value = []
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) loadAccounts()
  },
)

function chooseTour(key) {
  activeTourKey.value = key
  stepIndex.value = 0
}

async function executeStep() {
  const step = activeStep.value
  if (!step || switching.value) return
  switching.value = true
  try {
    if (user.user?.roleKey !== step.roleKey) {
      const account = accountByRole.value.get(step.roleKey)
      if (!account) throw new Error('未找到对应的内置演示账号')
      await user.loginDemo(account, '123456')
      ElMessage.success(`已切换为${account.role}视角`)
      window.dispatchEvent(new Event('campus-smart-dispatch-platform:session-ready'))
    }
    emit('update:modelValue', false)
    await router.push(step.path)
  } catch (error) {
    ElMessage.error(error?.message || '演示身份切换失败')
  } finally {
    switching.value = false
  }
}

async function resetDemoAndOpenStep() {
  const step = activeStep.value
  const superAccount = accountByRole.value.get('super_admin')
  const targetAccount = accountByRole.value.get(step.roleKey)
  if (!superAccount || !targetAccount || switching.value) {
    ElMessage.error('演示账号数据尚未加载')
    return
  }
  switching.value = true
  try {
    suspendCloudSync()
    const superSession = await apiRequest('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        studentNo: superAccount.studentNo,
        name: superAccount.name,
        password: '123456',
      },
    })
    setAuthToken(superSession.token)
    await apiRequest('/system/reset-demo', { method: 'POST' })
    clearBusinessState()
    const targetSession = await apiRequest('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        studentNo: targetAccount.studentNo,
        name: targetAccount.name,
        password: '123456',
      },
    })
    setAuthToken(targetSession.token)
    saveState('v2:user', targetSession.user)
    emit('update:modelValue', false)
    window.location.assign(step.path)
  } catch (error) {
    ElMessage.error(error?.message || '演示数据重置失败')
    switching.value = false
  }
}

function nextStep() {
  stepIndex.value = Math.min(activeTour.value.steps.length - 1, stepIndex.value + 1)
}

function previousStep() {
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    size="min(560px, 94vw)"
    append-to-body
    class="demo-guide"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="demo-guide__header">
        <span class="demo-guide__orb"><el-icon><Reading /></el-icon></span>
        <div>
          <strong>评审演示向导</strong>
          <span>按线路切换身份与页面，约 3 分钟完成核心验收</span>
        </div>
      </div>
    </template>

    <div class="demo-guide__body">
      <div class="demo-guide__current">
        当前身份
        <b>{{ currentRoleLabel }}</b>
      </div>

      <div class="demo-tour-tabs">
        <button
          v-for="(tour, index) in tours"
          :key="tour.key"
          type="button"
          :class="{ 'is-active': activeTourKey === tour.key }"
          @click="chooseTour(tour.key)"
        >
          <span class="mono">0{{ index + 1 }}</span>
          <strong>{{ tour.title }}</strong>
          <small>{{ tour.duration }}</small>
        </button>
      </div>

      <div class="demo-tour-summary">
        <p>{{ activeTour.summary }}</p>
      </div>

      <div v-if="demoStateWarning" class="notice notice--amber demo-state-warning">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ demoStateWarning }}建议先重置本线路演示数据。</span>
      </div>

      <div class="demo-steps">
        <button
          v-for="(step, index) in activeTour.steps"
          :key="`${activeTour.key}-${step.path}-${index}`"
          type="button"
          class="demo-step"
          :class="{
            'is-active': index === stepIndex,
            'is-done': index < stepIndex,
          }"
          @click="stepIndex = index"
        >
          <span class="demo-step__index">
            <el-icon v-if="index < stepIndex"><CircleCheck /></el-icon>
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="demo-step__copy">
            <strong>{{ step.title }}</strong>
            <small>{{ step.desc }}</small>
          </span>
          <span class="tag-soft demo-step__role">
            {{ accountByRole.get(step.roleKey)?.role || step.roleKey }}
          </span>
        </button>
      </div>

      <div class="demo-current-step">
        <span class="tag-soft tag-soft--brand">当前步骤 {{ stepIndex + 1 }} / {{ activeTour.steps.length }}</span>
        <h3>{{ activeStep.title }}</h3>
        <p>{{ activeStep.desc }}</p>
        <div class="demo-current-step__actions">
          <el-button :disabled="stepIndex === 0" @click="previousStep">上一步</el-button>
          <el-button :disabled="stepIndex === activeTour.steps.length - 1" @click="nextStep">
            下一步
          </el-button>
          <el-button :disabled="switching" @click="resetDemoAndOpenStep">
            重置演示并前往
          </el-button>
          <el-button type="primary" :loading="switching" @click="executeStep">
            <el-icon><SwitchButton v-if="user.user?.roleKey !== activeStep.roleKey" /><ArrowRight v-else /></el-icon>
            {{ user.user?.roleKey === activeStep.roleKey ? '前往当前步骤' : '切换身份并前往' }}
          </el-button>
        </div>
      </div>

      <div class="demo-guide__note">
        <strong>演示提示</strong>
        <span>所有账号密码均为 123456；如果任务已被接取、取消或完成，请点击“重置演示并前往”恢复初始步骤。</span>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.demo-guide__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.demo-guide__orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 8px;
  color: #fff;
  background: var(--brand-600);
}

.demo-guide__header > div {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.demo-guide__header strong {
  font-size: 14px;
  color: var(--text-1);
}

.demo-guide__header span {
  font-size: 12px;
  color: var(--text-3);
}

.demo-guide__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-guide__current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-3);
  background: var(--surface-2);
  font-size: 12px;
}

.demo-guide__current b {
  color: var(--brand-600);
}

.demo-tour-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.demo-tour-tabs button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  text-align: left;
  cursor: pointer;
}

.demo-tour-tabs button.is-active {
  border-color: var(--brand-300);
  background: var(--brand-50);
}

.demo-tour-tabs .mono {
  font-size: 12px;
  color: var(--brand-500);
}

.demo-tour-tabs strong {
  font-size: 12px;
  color: var(--text-1);
}

.demo-tour-tabs small {
  font-size: 12px;
  color: var(--text-3);
}

.demo-tour-summary {
  padding: 8px 12px;
  border-left: 3px solid var(--brand-400);
  border-radius: 0 8px 8px 0;
  background: var(--brand-50);
}

.demo-tour-summary p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
}

.demo-state-warning {
  margin: 0;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.6;
}

.demo-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}

.demo-step.is-active {
  border-color: var(--brand-300);
  box-shadow: var(--shadow-xs);
}

.demo-step.is-done {
  opacity: 0.72;
}

.demo-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  flex: none;
  border-radius: 8px;
  color: var(--brand-600);
  background: var(--brand-50);
  font-size: 12px;
  font-weight: 700;
}

.demo-step__copy {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
}

.demo-step__copy strong {
  font-size: 12px;
  color: var(--text-1);
}

.demo-step__copy small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.demo-step__role {
  flex: none;
}

.demo-current-step {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.demo-current-step h3 {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-1);
}

.demo-current-step p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-3);
}

.demo-current-step__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.demo-guide__note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-3);
  background: var(--amber-50);
  font-size: 12px;
  line-height: 1.55;
}

.demo-guide__note strong {
  color: var(--amber-600);
}

@media (max-width: 520px) {
  .demo-tour-tabs {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-step__role {
    display: none;
  }
}
</style>
