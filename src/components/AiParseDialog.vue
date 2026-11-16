<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, MagicStick, RefreshLeft, Close } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { parseRequirement, extractTime, SCENE_META, SCENE_LIST } from '@/utils/aiEngine'
import { parseRequirementCloud } from '@/utils/aiCloud'
import { clamp } from '@/utils/format'
import SceneIcon from './SceneIcon.vue'
import SceneTile from './SceneTile.vue'
import AiThinking from './AiThinking.vue'
import AiBadge from './AiBadge.vue'

const app = useAppStore()
const user = useUserStore()
const router = useRouter()

const visible = computed({
  get: () => app.aiDialog.visible,
  set: (v) => {
    if (!v) app.closeAiDialog()
  },
})

const phase = ref('input')
const text = ref('')
const result = ref(null)
const fieldEdits = ref({})
const error = ref('')
const engineNotice = ref('')
const textareaRef = ref(null)

const ALL_EXAMPLES = [
  '周三下午想借一间能坐 30 人、有投影的教室开班会',
  '在A栋二楼大厅丢了一个蓝色水杯，帮忙发个寻物',
  '校门口奶茶拼单，6.5 一杯，还差 4 杯成团',
  '学生超市周末营业到几点',
]
const examples = computed(() =>
  user.canAccess('classroom')
    ? ALL_EXAMPLES
    : ALL_EXAMPLES.filter((item) => !/教室|借一间/.test(item)),
)
const availableScenes = computed(() =>
  SCENE_LIST.filter((scene) => scene.key !== 'classroom' || user.canAccess('classroom')),
)
const supportedSceneText = computed(() =>
  user.canAccess('classroom')
    ? '教室借用 · 失物招领 · 拼单集市 · 校园论坛'
    : '失物招领 · 拼单集市 · 校园论坛',
)

const STEPS = ['识别需求所属场景', '抽取时间 / 地点 / 人数等要素', '校验要素完整性与置信度', '生成可编辑的确认单']

watch(
  () => app.aiDialog.visible,
  (v) => {
    if (!v) return
    phase.value = 'input'
    result.value = null
    fieldEdits.value = {}
    error.value = ''
    engineNotice.value = ''
    text.value = app.aiDialog.text || ''
    if (text.value.trim()) {
      nextTick(() => runParse())
    } else {
      nextTick(() => textareaRef.value?.focus?.())
    }
  },
)

const missingRequired = computed(() =>
  (result.value?.fields || []).filter((f) => f.required && !String(fieldEdits.value[f.key] || '').trim()),
)
const confidencePct = computed(() => Math.round((result.value?.confidence || 0) * 100))
const lowConfidence = computed(() => Boolean(result.value?.ok) && result.value.confidence < 0.72)
const confidenceTone = computed(() => (confidencePct.value >= 85 ? 'teal' : confidencePct.value >= 70 ? 'amber' : 'coral'))

async function runParse() {
  if (!text.value.trim()) {
    error.value = '先用一句话描述一下你的需求吧'
    return
  }
  error.value = ''
  engineNotice.value = ''
  phase.value = 'parsing'
  const local = parseRequirement(text.value)
  let res = local
  try {
    const remote = await parseRequirementCloud(text.value)
    const scene = SCENE_META[remote.scene] ? remote.scene : local.scene
    const remoteFields = Array.isArray(remote.fields)
      ? remote.fields.filter((field) => field && field.key && field.label)
      : []
    res = {
      ...local,
      ...remote,
      ok: scene !== 'unknown',
      scene,
      sceneName: SCENE_META[scene]?.name || local.sceneName,
      confidence: clamp(Number(remote.confidence) || local.confidence || 0, 0, 1),
      fields: remoteFields.length ? remoteFields : local.fields,
      missing: Array.isArray(remote.missing) ? remote.missing : local.missing,
      route: SCENE_META[scene]?.route || local.route,
      routeQuery: {
        ...(local.routeQuery || {}),
        ...(remote.routeQuery && typeof remote.routeQuery === 'object'
          ? remote.routeQuery
          : {}),
      },
      actionHint: local.actionHint,
      engine: remote.engine || 'DeepSeek-V4.1-Flash',
    }
  } catch (cloudError) {
    res = local
    engineNotice.value =
      cloudError?.code === 'AI_KEY_NOT_CONFIGURED'
        ? 'DeepSeek API Key 尚未配置，本次使用本地规则引擎完成解析'
        : `DeepSeek 暂时不可用，已降级到本地规则引擎：${cloudError?.message || cloudError}`
  }
  if (res.scene === 'classroom' && !user.canAccess('classroom')) {
    res = {
      ...res,
      ok: false,
      summary: '当前角色不能使用教室借用。你可以继续使用失物招领、拼单集市或校园论坛。',
    }
  }
  result.value = res
  fieldEdits.value = Object.fromEntries((res.fields || []).map((f) => [f.key, f.value ?? '']))
  phase.value = 'result'
}

function pickExample(example) {
  text.value = example
  error.value = ''
  runParse()
}

function restart() {
  phase.value = 'input'
  result.value = null
  fieldEdits.value = {}
  error.value = ''
  nextTick(() => textareaRef.value?.focus?.())
}

function goScene(scene) {
  if (scene === 'classroom' && !user.canAccess('classroom')) {
    ElMessage.warning('当前角色无权使用教室借用')
    return
  }
  visible.value = false
  router.push({ path: SCENE_META[scene].route, query: { from: 'ai' } })
}

function toQuery() {
  const res = result.value
  const q = { ...(res.routeQuery || {}) }
  const get = (k) => String(fieldEdits.value[k] ?? '').trim()

  if (res.scene === 'classroom') {
    const t = extractTime(get('time'))
    if (t.day) q.day = t.day
    if (t.start && t.end) {
      q.start = t.start
      q.end = t.end
    }
    const cap = get('capacity').match(/\d+/)
    q.capacity = cap ? cap[0] : ''
    q.equipment = get('equipment')
      .split(/[、,，\s]+/)
      .filter(Boolean)
      .join(',')
    q.building = get('building')
    q.kind = get('kind')
    q.purpose = get('purpose')
  } else if (res.scene === 'lostfound') {
    const type = get('type')
    q.type = type.includes('招领') ? 'found' : type.includes('寻物') ? 'lost' : q.type || 'lost'
    q.item = get('item')
    q.color = get('color')
    q.place = get('place')
    q.time = get('time')
    q.detail = get('detail')
  } else if (res.scene === 'groupbuy') {
    q.product = get('product')
    const p = get('price').match(/\d+(\.\d+)?/)
    q.price = p ? p[0] : ''
    const t = get('target').match(/\d+/)
    q.target = t ? t[0] : ''
    q.pickup = get('pickup')
    q.time = get('deadline')
  } else if (res.scene === 'forum') {
    q.create = '1'
    q.title = get('title')
    q.category = get('category')
    q.content = get('content')
    q.tags = get('tags')
      .split(/[、,，\s]+/)
      .filter(Boolean)
      .join(',')
  }
  q.from = 'ai'
  return q
}

function confirm() {
  if (!result.value?.ok) return
  if (result.value.scene === 'classroom' && !user.canAccess('classroom')) {
    error.value = '当前角色不能使用教室借用功能'
    return
  }
  if (missingRequired.value.length) {
    error.value = `还有 ${missingRequired.value.length} 项必填信息需要补充：${missingRequired.value.map((f) => f.label).join('、')}`
    return
  }
  const res = result.value
  const query = toQuery()
  visible.value = false
  ElMessage({
    message: `已按「${res.sceneName}」场景继续，AI 会保留这次的解析结果`,
    type: 'success',
    duration: 1800,
  })
  router.push({ path: res.route, query })
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="ai-dialog"
    width="min(700px, 94vw)"
    align-center
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
  >
    <template #header>
      <div class="ai-head">
        <div class="ai-head__left">
          <span class="ai-head__orb"><el-icon :size="18"><MagicStick /></el-icon></span>
          <div>
            <div class="ai-head__title">一句话，交给校园智能调度平台</div>
            <div class="ai-head__sub">
              {{ phase === 'result' ? '解析结果可逐项修改，确认后才执行' : 'AI 需求解析 · 智能匹配 · 自动通知' }}
            </div>
          </div>
        </div>
        <button class="ai-head__close" type="button" aria-label="关闭" @click="visible = false">
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </div>
    </template>

    <div class="ai-body">
      <!-- 第一步：输入 -->
      <template v-if="phase === 'input'">
        <div class="ai-input">
          <el-input
            ref="textareaRef"
            v-model="text"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            maxlength="160"
            show-word-limit
            resize="none"
            placeholder="例如：周三下午想借一间能坐 30 人、有投影的教室开班会"
            @keydown.enter.exact.prevent="runParse"
          />
        </div>
        <div class="ai-examples">
          <div class="ai-examples__label">试试这样说</div>
          <div class="ai-examples__list">
            <button v-for="item in examples" :key="item" type="button" class="ai-example" @click="pickExample(item)">
              <span class="ai-example__spark">✦</span>
              <span>{{ item }}</span>
            </button>
          </div>
        </div>
        <div class="ai-note">
          <el-icon :size="14"><MagicStick /></el-icon>
          <span>配置 DeepSeek API Key 后将优先调用 DeepSeek V4.1 Flash；密钥缺失或服务异常时自动改用本地规则引擎。</span>
        </div>
        <div v-if="error" class="ai-error">{{ error }}</div>
        <div class="ai-foot">
          <span class="ai-foot__hint">支持场景：{{ supportedSceneText }}</span>
          <div class="ai-foot__actions">
            <el-button text @click="visible = false">取消</el-button>
            <el-button type="primary" :disabled="!text.trim()" @click="runParse">
              让 AI 解析
              <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 第二步：解析中 -->
      <AiThinking v-else-if="phase === 'parsing'" :steps="STEPS" />

      <!-- 第三步：结果确认 -->
      <template v-else>
        <template v-if="result && result.ok">
          <div class="ai-result-head">
            <div class="ai-result-head__scene">
              <SceneIcon :scene="result.scene" :size="46" />
              <div>
                <div class="ai-result-head__name">
                  {{ result.sceneName }}
                  <AiBadge text="AI 解析" ghost small />
                </div>
                <div class="ai-result-head__meta">引擎：{{ result.engine }}</div>
              </div>
            </div>
            <div class="ai-conf" :class="`ai-conf--${confidenceTone}`">
              <div class="ai-conf__value">{{ confidencePct }}<small>%</small></div>
              <div class="ai-conf__label">置信度</div>
            </div>
          </div>

          <div v-if="engineNotice" class="ai-alert ai-alert--amber">
            {{ engineNotice }}
          </div>
          <div class="ai-summary">{{ result.summary }}</div>

          <div class="ai-fields">
            <div v-for="field in result.fields" :key="field.key" class="ai-field">
              <label class="ai-field__label">
                {{ field.label }}
                <span v-if="field.required" class="ai-field__req">必填</span>
              </label>
              <el-select
                v-if="field.type === 'select'"
                v-model="fieldEdits[field.key]"
                :placeholder="`请选择${field.label}`"
                :class="{ 'is-missing': field.required && !String(fieldEdits[field.key] || '').trim() }"
              >
                <el-option v-for="opt in field.options || []" :key="opt" :label="opt" :value="opt" />
              </el-select>
              <el-input
                v-else-if="field.type === 'textarea'"
                v-model="fieldEdits[field.key]"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 7 }"
                :placeholder="`请填写${field.label}`"
                :class="{ 'is-missing': field.required && !String(fieldEdits[field.key] || '').trim() }"
              />
              <el-input
                v-else
                v-model="fieldEdits[field.key]"
                :placeholder="`请填写${field.label}`"
                :class="{ 'is-missing': field.required && !String(fieldEdits[field.key] || '').trim() }"
              />
            </div>
          </div>

          <div v-if="missingRequired.length" class="ai-alert ai-alert--amber">
            还缺 {{ missingRequired.length }} 项必填信息：{{ missingRequired.map((f) => f.label).join('、') }}。补全后 AI 匹配会更准确。
          </div>
          <div v-if="lowConfidence" class="ai-alert ai-alert--coral">
            这次理解的置信度偏低（{{ confidencePct }}%），建议人工核对上面的字段，或
            <button type="button" class="ai-link" @click="restart">重新描述</button>
            一次。
          </div>

          <div class="ai-hint-line">
            <span class="dot dot--brand"></span>
            下一步：{{ result.actionHint }}
          </div>
          <div v-if="error" class="ai-error">{{ error }}</div>

          <div class="ai-foot">
            <div class="ai-foot__actions ai-foot__actions--full">
              <el-button text @click="restart">
                <el-icon class="el-icon--left"><RefreshLeft /></el-icon>重新描述
              </el-button>
              <div class="grow"></div>
              <el-button type="primary" @click="confirm">
                {{
                  result.scene === 'forum'
                    ? '去论坛发帖'
                    : result.actionHint?.includes('推荐')
                      ? '查看 AI 推荐'
                      : '确认并继续'
                }}
                <el-icon class="el-icon--right"><ArrowRight /></el-icon>
              </el-button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="ai-unknown">
            <div class="ai-unknown__icon"><el-icon :size="26"><MagicStick /></el-icon></div>
            <div class="ai-unknown__title">{{ result?.summary || '我还没太理解这句话' }}</div>
            <p class="ai-unknown__desc">换个说法，或者直接选择下面的场景继续。你的每一句话都不会被用于训练。</p>
          </div>
          <div class="ai-unknown__grid">
            <SceneTile v-for="scene in availableScenes" :key="scene.key" :scene="scene.key" compact @click="goScene(scene.key)" />
          </div>
          <div class="ai-examples__label mt-4">再试一句</div>
          <div class="ai-examples__list">
            <button v-for="item in result?.suggestions || examples" :key="item" type="button" class="ai-example" @click="pickExample(item)">
              <span class="ai-example__spark">✦</span>
              <span>{{ item }}</span>
            </button>
          </div>
          <div class="ai-foot">
            <div class="ai-foot__actions ai-foot__actions--full">
              <el-button text @click="restart">返回修改</el-button>
              <div class="grow"></div>
              <el-button type="primary" @click="visible = false">先逛逛</el-button>
            </div>
          </div>
        </template>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-head__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-head__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  color: var(--text-invert);
  background: var(--brand-600);
  box-shadow: none;
}

.ai-head__title {
  font-family: var(--font-serif);
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-1);
}

.ai-head__sub {
  margin-top: 4px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.ai-head__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  transition: all var(--dur);
}

.ai-head__close:hover {
  color: var(--text-1);
  border-color: var(--line-strong);
  background: var(--surface-3);
}

.ai-body {
  max-height: min(68vh, 640px);
  overflow-y: auto;
  padding: 0px 0px 0;
}

.ai-input :deep(.el-textarea__inner) {
  padding: 12px 16px;
  font-size: var(--fs-md);
  line-height: 1.7;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.ai-input :deep(.el-textarea__inner:focus) {
  background: var(--surface);
}

.ai-examples {
  margin-top: 16px;
}

.ai-examples__label {
  margin-bottom: 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.ai-examples__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-example {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  font-family: inherit;
  font-size: var(--fs-sm);
  line-height: 1.55;
  color: var(--text-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: all var(--dur) var(--ease-out);
}

.ai-example:hover {
  border-color: var(--brand-300);
  background: var(--brand-50);
  color: var(--brand-700);
  transform: translateX(2px);
}

.ai-example__spark {
  color: var(--brand-400);
  font-size: 12px;
  line-height: 1.6;
}

.ai-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  font-size: var(--fs-xs);
  line-height: 1.6;
}

.ai-note .el-icon {
  margin-top: 0px;
  flex: none;
  color: var(--brand-500);
}

.ai-error {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--coral-50);
  color: var(--coral-600);
  font-size: var(--fs-sm);
}

.ai-foot {
  position: sticky;
  bottom: 0;
  margin-top: 16px;
  padding: 12px 0 0px;
  background: linear-gradient(180deg, rgba(255, 253, 250, 0), var(--surface) 30%);
}

.ai-foot__hint {
  font-size: var(--fs-xs);
  color: var(--text-4);
}

.ai-foot__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ai-foot__actions--full {
  margin-top: 0;
}

.ai-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--grad-brand-soft);
}

.ai-result-head__scene {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-result-head__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-1);
}

.ai-result-head__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.ai-conf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 58px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.ai-conf__value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--teal-600);
  font-variant-numeric: tabular-nums;
}

.ai-conf--amber .ai-conf__value {
  color: var(--amber-600);
}

.ai-conf--coral .ai-conf__value {
  color: var(--coral-600);
}

.ai-conf__value small {
  font-size: 12px;
  margin-left: 0px;
}

.ai-conf__label {
  margin-top: 0px;
  font-size: 12px;
  color: var(--text-3);
}

.ai-summary {
  margin-top: 12px;
  padding: 12px 12px;
  border-left: 3px solid var(--brand-400);
  border-radius: 4px var(--radius) var(--radius) 4px;
  background: var(--surface-2);
  font-size: var(--fs-base);
  line-height: 1.7;
  color: var(--text-1);
}

.ai-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 12px;
  margin-top: 16px;
}

.ai-field__label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-2);
}

.ai-field__req {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 600;
}

.ai-field :deep(.is-missing .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--coral-100) inset;
  background: var(--surface-2);
}

.ai-field :deep(.el-input__wrapper) {
  min-height: 38px;
}

.ai-alert {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: var(--fs-xs);
  line-height: 1.65;
}

.ai-alert--amber {
  background: var(--amber-50);
  color: var(--amber-600);
}

.ai-alert--coral {
  background: var(--coral-50);
  color: var(--coral-600);
}

.ai-link {
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  font-weight: 700;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.ai-hint-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: var(--fs-xs);
  line-height: 1.65;
  color: var(--text-3);
}

.ai-hint-line .dot {
  margin-top: 8px;
}

.ai-unknown {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0 4px;
  text-align: center;
}

.ai-unknown__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--grad-brand-soft);
  color: var(--brand-500);
}

.ai-unknown__title {
  max-width: 440px;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.6;
  color: var(--text-1);
}

.ai-unknown__desc {
  margin: 8px 0 16px;
  max-width: 400px;
  font-size: var(--fs-xs);
  line-height: 1.7;
  color: var(--text-3);
}

.ai-unknown__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

@media (max-width: 640px) {
  .ai-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-unknown__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ai-body {
    max-height: 66vh;
  }

  .ai-foot__hint {
    display: none;
  }
}
</style>

<style>
.ai-dialog.el-dialog {
  border-radius: var(--radius-xl);
  padding: 24px 24px 16px;
  box-shadow: var(--shadow-overlay);
}

.ai-dialog .el-dialog__header {
  padding: 0 0 16px;
  margin: 0;
}

.ai-dialog .el-dialog__body {
  padding: 0;
}

.ai-dialog .el-dialog__footer {
  padding: 0;
}

@media (max-width: 640px) {
  .ai-dialog.el-dialog {
    border-radius: var(--radius-lg);
    padding: 16px 16px 12px;
  }
}
</style>
