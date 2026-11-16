<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  CircleCheck,
  Clock,
  Coin,
  Connection,
  InfoFilled,
  Location,
  Lock,
  MagicStick,
  Plus,
  Search,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatusPill from '@/components/StatusPill.vue'
import AiBadge from '@/components/AiBadge.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import { useLostfoundStore } from '@/stores/lostfound'
import { useUserStore } from '@/stores/user'
import { lostfoundCategories } from '@/mock/seed'
import { generateWithCloud } from '@/utils/aiCloud'
import { uploadImage } from '@/utils/image'

const router = useRouter()
const route = useRoute()
const store = useLostfoundStore()
const user = useUserStore()

const formRef = ref(null)
const generating = ref(false)
const prefilled = ref(false)
const fileList = ref([])
const previewUrl = ref('')
const uploadingImage = ref(false)

const form = reactive({
  type: 'lost',
  title: '',
  item: '',
  category: '其他',
  color: '',
  place: '',
  time: '',
  description: '',
  contact: '',
  tags: [],
  image: '',
  aiGenerated: false,
  rewardEnabled: false,
  rewardAmount: 10,
  rewardNote: '',
})

const rules = {
  item: [{ required: true, message: '请填写物品名称', trigger: 'blur' }],
  place: [{ required: true, message: '请填写丢失 / 拾取地点', trigger: 'blur' }],
}

const categories = lostfoundCategories.filter((cat) => cat !== '全部类别')
const rewardPresets = [5, 10, 20, 50]
const tagOptions = [
  '寻物',
  '招领',
  '证件卡类',
  '数码产品',
  '生活用品',
  '学习用品',
  '蓝色',
  '黑色',
  '白色',
  '透明',
  'A栋',
  'B栋',
  '食堂',
  '宿舍楼下',
  '操场',
  '会议室',
  '报告厅',
]

const now = new Date()
const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

const canGenerate = computed(() => Boolean(form.item.trim() && form.place.trim()))
const publishing = computed(() => store.publishing)

const maskedContact = computed(() => {
  const name = String(user.user?.name || '同学').trim()
  return `${name.slice(0, 1)}**`
})

const previewTitle = computed(() => {
  if (form.title.trim()) return form.title
  if (!form.item.trim()) return '标题将在这里生成'
  const prefix = form.type === 'found' ? '【招领】' : '【寻物】'
  return `${prefix}${form.color ? form.color : ''}${form.item}`
})

const previewDesc = computed(() => {
  if (form.description.trim()) return form.description
  return '填写物品名称、地点与颜色后，点击「AI 生成文案」，这里会实时呈现发布后的卡片效果。'
})

const filledCount = computed(() => {
  const checks = [
    form.item,
    form.category,
    form.color,
    form.place,
    form.time,
    form.description,
    form.contact,
    form.tags.length ? 'tags' : '',
  ]
  return checks.filter(Boolean).length
})

const completeness = computed(() => Math.round((filledCount.value / 8) * 100))

function text(value) {
  if (Array.isArray(value)) return String(value[0] || '')
  return value === null || value === undefined ? '' : String(value)
}

async function generate(silent = false) {
  if (!canGenerate.value && !silent) {
    ElMessage.warning('请先填写物品名称和地点，再让 AI 生成文案')
    return
  }
  if (!form.item.trim() && !form.place.trim()) return

  generating.value = true
  const payload = {
    type: form.type,
    item: form.item,
    color: form.color,
    place: form.place,
    time: form.time,
    detail: form.aiGenerated ? '' : form.description,
  }
  let copy
  try {
    const response = await generateWithCloud('lostfound_copy', payload)
    const result = response.result || {}
    if (!result.title || !result.content) throw new Error('模型返回内容不完整')
    copy = {
      title: String(result.title).slice(0, 40),
      content: String(result.content).slice(0, 300),
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 4).map(String) : [],
      category: String(result.category || '其他'),
    }
  } catch (error) {
    copy = store.generateCopy(payload)
    if (!silent) {
      ElMessage.warning(
        `DeepSeek 暂不可用，已使用本地规则生成文案：${error?.message || error}`,
      )
    }
  }
  form.title = copy.title
  form.description = copy.content
  form.tags = [...copy.tags]
  if (copy.category && copy.category !== '其他') form.category = copy.category
  form.aiGenerated = true
  generating.value = false
  if (!silent) ElMessage.success('AI 文案已生成，可继续编辑')
}

function onFileChange(file) {
  if (!file || !file.raw) return
  if (file.raw.type && !file.raw.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    fileList.value = fileList.value.filter((item) => item.uid !== file.uid)
    return
  }
  if (file.raw.size > 8 * 1024 * 1024) {
    ElMessage.warning('图片请控制在 8MB 以内，演示环境仅本地预览')
    fileList.value = fileList.value.filter((item) => item.uid !== file.uid)
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file.raw)
  file.url = previewUrl.value

  uploadingImage.value = true
  uploadImage(file.raw)
    .then((result) => {
      form.image = result?.url || ''
      ElMessage.success('图片已上传，业务数据只保存图片地址')
    })
    .catch((error) => {
      form.image = ''
      fileList.value = []
      ElMessage.warning(error?.message || '图片上传失败，请更换一张试试')
    })
    .finally(() => {
      uploadingImage.value = false
    })
}

function onFileRemove() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  form.image = ''
  uploadingImage.value = false
}

function onExceed() {
  ElMessage.warning('最多上传 1 张图片，仅本地预览')
}

async function submit() {
  if (!formRef.value || generating.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    ElMessage.warning('请先补全物品名称与地点')
    return
  }

  if (!form.title.trim() || !form.description.trim()) {
    const copy = store.generateCopy({
      type: form.type,
      item: form.item,
      color: form.color,
      place: form.place,
      time: form.time,
      detail: form.aiGenerated ? '' : form.description,
    })
    if (!form.title.trim()) form.title = copy.title
    if (!form.description.trim()) form.description = copy.content
    if (!form.tags.length) form.tags = [...copy.tags]
    if (copy.category && copy.category !== '其他') form.category = copy.category
    form.aiGenerated = true
  }

  try {
    await store.publish({ ...form })
    store.resetFilters()
    ElMessage.success('发布成功，AI 已开始为你匹配线索')
    router.push('/lostfound')
  } catch {
    ElMessage.error('发布失败，请稍后重试')
  }
}

function cancel() {
  router.push('/lostfound')
}

function goBack() {
  router.push('/lostfound')
}

onMounted(async () => {
  const q = route.query
  const type = text(q.type)
  if (type === 'lost' || type === 'found') form.type = type
  if (text(q.item)) form.item = text(q.item)
  if (text(q.category) && categories.includes(text(q.category))) {
    form.category = text(q.category)
  }
  if (text(q.color)) form.color = text(q.color)
  if (text(q.place)) form.place = text(q.place)
  if (text(q.time)) form.time = text(q.time)
  if (text(q.description)) form.description = text(q.description)

  if (q.from === 'ai') {
    prefilled.value = true
    if (text(q.detail)) form.description = text(q.detail)
    await nextTick()
    if (form.item || form.place) await generate(true)
  }
})

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="发布失物 / 招领"
      eyebrow="场景 02 · AI 生成文案"
      desc="把物品、颜色、地点告诉 AI，它会扩写成一条规范信息，并自动进入双向匹配池。"
    >
      <template #meta>
        <div class="head-meta">
          <span class="tag-soft tag-soft--brand">
            <el-icon><MagicStick /></el-icon>AI 文案生成能力
          </span>
          <span class="t-xs faint">图片独立存储 · 联系方式默认脱敏</span>
        </div>
      </template>
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回广场</el-button>
      </template>
    </PageHeader>

    <div v-if="prefilled" class="notice prefill-notice">
      <el-icon><MagicStick /></el-icon>
      <div class="grow">
        <b>已根据你的描述预填</b>
        <p>
          字段来自 AI 意图解析结果，可直接修改。
          {{ form.aiGenerated ? 'AI 已生成一版规范文案，发布前请核对事实。' : '补齐物品名称与地点后，可一键生成规范文案。' }}
        </p>
      </div>
      <AiBadge ghost small />
    </div>

    <div class="grid g-7-5 publish-main">
      <!-- 左：表单 -->
      <SectionCard title="填写物品信息" desc="带 * 为必填项；信息越具体，双向匹配越准">
        <template #actions>
          <AiBadge v-if="form.aiGenerated" ghost small />
        </template>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="publish-form"
        >
          <el-form-item label="信息类型" class="type-item">
            <el-radio-group v-model="form.type" class="type-pick">
              <el-radio-button value="lost">
                <span class="type-opt">
                  <span class="type-opt__icon type-opt__icon--lost">
                    <el-icon><Search /></el-icon>
                  </span>
                  <span class="type-opt__text">
                    <b>寻物</b>
                    <small>我丢了东西，想找回来</small>
                  </span>
                </span>
              </el-radio-button>
              <el-radio-button value="found">
                <span class="type-opt">
                  <span class="type-opt__icon type-opt__icon--found">
                    <el-icon><Plus /></el-icon>
                  </span>
                  <span class="type-opt__text">
                    <b>招领</b>
                    <small>我捡到东西，等待失主</small>
                  </span>
                </span>
              </el-radio-button>
            </el-radio-group>
          </el-form-item>

          <div class="form-grid">
            <el-form-item label="物品名称" prop="item">
              <el-input v-model="form.item" maxlength="20" placeholder="如：蓝色保温杯、校园卡" />
            </el-form-item>
            <el-form-item label="物品类别">
              <el-select v-model="form.category" placeholder="选择类别">
                <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
              </el-select>
            </el-form-item>
            <el-form-item label="颜色特征">
              <el-input v-model="form.color" maxlength="10" placeholder="如：蓝色 / 透明" />
            </el-form-item>
            <el-form-item label="丢失 / 拾取地点" prop="place">
              <el-input v-model="form.place" maxlength="20" placeholder="如：A栋二楼大厅 / 学生超市" />
            </el-form-item>
            <el-form-item label="大致时间">
              <el-input v-model="form.time" maxlength="16" placeholder="如：今天下午 / 周三 15:00" />
            </el-form-item>
            <el-form-item label="联系方式">
              <el-input
                v-model="form.contact"
                :prefix-icon="Lock"
                maxlength="30"
                placeholder="手机号 / 微信 / 站内联系"
              />
            </el-form-item>
          </div>

          <p class="field-hint form-contact-hint">
            <el-icon><Lock /></el-icon>
            联系方式不会公开展示，广场仅显示脱敏昵称「{{ maskedContact }}」。
          </p>

          <div v-if="form.type === 'lost'" class="reward-editor">
            <div class="reward-editor__head">
              <span class="reward-editor__icon"><el-icon><Coin /></el-icon></span>
              <div>
                <b>寻物悬赏</b>
                <p>可对提供有效线索或归还物品的同学给予小费打赏。</p>
              </div>
              <el-switch v-model="form.rewardEnabled" active-text="设置打赏" inactive-text="暂不打赏" />
            </div>

            <template v-if="form.rewardEnabled">
              <div class="reward-presets">
                <button
                  v-for="amount in rewardPresets"
                  :key="amount"
                  type="button"
                  class="chip chip--sm"
                  :class="{ 'is-active': Number(form.rewardAmount) === amount }"
                  @click="form.rewardAmount = amount"
                >
                  ¥{{ amount }}
                </button>
                <el-input-number
                  v-model="form.rewardAmount"
                  :min="0.01"
                  :max="500"
                  :precision="2"
                  :step="1"
                  controls-position="right"
                />
              </div>
              <el-input
                v-model="form.rewardNote"
                maxlength="40"
                placeholder="打赏说明（选填），如：归还后当面说明特征即可"
              />
              <p class="reward-editor__hint">
                打赏在发布者确认线索或归还结果后结算；本演示环境仅记录结算状态。
              </p>
            </template>

            <div v-else class="reward-editor__none">
              <el-icon><InfoFilled /></el-icon>
              <span>未设置打赏时，失主需要在收到线索后自行联系拾得者领取，页面会显示联系与确认流程。</span>
            </div>
          </div>

          <div class="ai-box">
            <div class="ai-box__icon"><el-icon :size="20"><MagicStick /></el-icon></div>
            <div class="ai-box__main">
              <div class="row gap-2 wrap">
                <b>AI 生成规范文案</b>
                <AiBadge ghost small />
              </div>
              <p>根据物品、颜色、地点与描述自动扩写标题和描述，生成后仍可自由编辑。</p>
              <p v-if="!canGenerate" class="ai-box__warn">
                <el-icon><InfoFilled /></el-icon>填写「物品名称」与「地点」后即可生成
              </p>
            </div>
            <el-button
              type="primary"
              :loading="generating"
              :disabled="!canGenerate || generating"
              @click="generate(false)"
            >
              {{ generating ? '生成中…' : form.aiGenerated ? '重新生成' : 'AI 生成文案' }}
            </el-button>
          </div>

          <div v-if="form.aiGenerated" class="ai-note">
            <AiBadge small />
            <span>AI 生成内容可编辑，发布前请核对物品特征与时间地点。</span>
          </div>

          <el-form-item label="发布标题" class="mt-3">
            <el-input
              v-model="form.title"
              maxlength="40"
              show-word-limit
              placeholder="留空将由 AI 生成规范标题"
            />
          </el-form-item>

          <el-form-item label="详细描述">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="5"
              maxlength="300"
              show-word-limit
              placeholder="补充独特特征，如贴纸、划痕、挂件等；点击上方按钮可让 AI 扩写。"
            />
          </el-form-item>

          <el-form-item label="特征标签">
            <el-select
              v-model="form.tags"
              class="tag-select"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="AI 会自动提取，也可以手动添加"
            >
              <el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </el-form-item>

          <el-form-item label="物品图片（可选）">
            <el-upload
              v-model:file-list="fileList"
              class="uploader"
              :class="{ 'uploader--full': fileList.length }"
              list-type="picture-card"
              :auto-upload="false"
              :limit="1"
              accept="image/*"
              :on-change="onFileChange"
              :on-remove="onFileRemove"
              :on-exceed="onExceed"
            >
              <el-icon :size="22"><Plus /></el-icon>
            </el-upload>
            <p class="field-hint">
              图片会上传到服务端独立存储，业务数据只保存图片地址；原图将被压缩到最长边 1000px。
            </p>
          </el-form-item>

          <div class="form-actions">
            <el-button @click="cancel">取消</el-button>
            <el-button
              type="primary"
              :loading="publishing"
              :disabled="generating || uploadingImage"
              @click="submit"
            >
              {{ publishing ? '发布中…' : '提交并发布' }}
            </el-button>
          </div>
        </el-form>
      </SectionCard>

      <!-- 右：实时预览 -->
      <aside class="publish-side">
        <SectionCard title="AI 生成实时预览" desc="发布后在广场中的卡片效果">
          <template #actions>
            <AiBadge v-if="form.aiGenerated" ghost small />
            <el-button
              v-else
              text
              size="small"
              :loading="generating"
              :disabled="!canGenerate"
              @click="generate(false)"
            >
              生成
            </el-button>
          </template>

          <div class="preview-wrap" v-loading="generating" element-loading-text="AI 正在生成文案…">
            <div class="preview-card" :class="`preview-card--${form.type}`">
              <div class="preview-card__head">
                <span class="mono t-xs faint">LF{{ dateStamp }}-XXX</span>
                <StatusPill
                  status="open"
                  :text="form.type === 'lost' ? '寻物' : '招领'"
                  :tone="form.type === 'lost' ? 'coral' : 'teal'"
                  :dot="false"
                />
                <StatusPill status="matching" />
                <AiBadge v-if="form.aiGenerated" ghost small />
              </div>

              <h3 class="preview-card__title">{{ previewTitle }}</h3>
              <p class="preview-card__desc clamp-3">{{ previewDesc }}</p>

              <div class="preview-card__meta">
                <span class="preview-meta">
                  <el-icon><Location /></el-icon>{{ form.place || '地点待填写' }}
                </span>
                <span class="preview-meta">
                  <el-icon><Clock /></el-icon>{{ form.time || '时间待填写' }}
                </span>
                <span class="preview-contact">
                  <el-icon><Lock /></el-icon>{{ maskedContact }}
                </span>
              </div>

              <div v-if="form.type === 'lost'" class="preview-reward">
                <span v-if="form.rewardEnabled" class="tag-soft tag-soft--amber">
                  <el-icon><Coin /></el-icon>悬赏 ¥{{ Number(form.rewardAmount || 0).toFixed(2) }}
                </span>
                <span v-else class="tag-soft">
                  <el-icon><InfoFilled /></el-icon>未设置打赏 · 自行联系领取
                </span>
              </div>

              <div v-if="form.tags.length" class="preview-card__tags">
                <span v-for="tag in form.tags" :key="tag" class="tag-soft tag-soft--brand"># {{ tag }}</span>
              </div>

              <img v-if="form.image" :src="form.image" class="preview-card__image" alt="本地预览图片" />

              <div class="preview-card__foot">
                <span class="tag-soft"><el-icon><Connection /></el-icon>发布后自动参与双向匹配</span>
                <AiBadge v-if="form.aiGenerated" small />
                <span v-else class="t-xs dim">尚未使用 AI 生成</span>
              </div>
            </div>
          </div>

          <div class="preview-meter">
            <ProgressRing
              :value="completeness"
              :size="56"
              :stroke="5"
              :tone="completeness >= 80 ? 'teal' : 'brand'"
              caption="完整度"
            />
            <div class="preview-meter__main">
              <b>信息完整度 {{ completeness }}% · 已填 {{ filledCount }}/8 项</b>
              <p>补齐颜色、时间与特征细节，AI 匹配和认领成功率都会更高。</p>
            </div>
          </div>

          <div v-if="form.aiGenerated" class="notice notice--teal preview-note">
            <el-icon><CircleCheck /></el-icon>
            <span>AI 生成内容可编辑，发布前请核对事实。</span>
          </div>
          <div v-else class="notice preview-note">
            <el-icon><InfoFilled /></el-icon>
            <span>还没生成文案？点击左侧「AI 生成文案」，会自动填入标题与描述。</span>
          </div>
        </SectionCard>

        <div class="card privacy-card">
          <div class="row gap-2">
            <el-icon><Lock /></el-icon><b>隐私与安全</b>
          </div>
          <ul class="privacy-list">
            <li>联系方式仅展示脱敏昵称，不展示真实号码。</li>
            <li>AI 生成内容均带标识，方便其他同学判断。</li>
            <li>认领前请先核对物品细节，避免误领。</li>
          </ul>
          <div class="privacy-foot">
            <AiBadge ghost small text="AI 合规" />
            <span class="t-xs dim">无真实个人信息进入演示数据</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.head-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.prefill-notice {
  align-items: flex-start;
}

.prefill-notice b {
  font-size: var(--fs-sm);
}

.prefill-notice p {
  margin: 0px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.65;
  opacity: 0.9;
}

.publish-main {
  align-items: start;
}

/* ---------- 表单 ---------- */
.publish-form {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.type-item {
  margin-bottom: 16px;
}

.type-pick {
  display: flex;
  width: 100%;
  gap: 8px;
}

.type-pick :deep(.el-radio-button) {
  flex: 1;
  min-width: 0;
}

.type-pick :deep(.el-radio-button__inner) {
  display: flex;
  align-items: center;
  width: 100%;
  height: auto;
  padding: 8px 12px;
  margin: 0;
  border: 1px solid var(--line) !important;
  border-radius: var(--radius-sm) !important;
  background: var(--surface-2);
  color: var(--text-1);
  box-shadow: none !important;
  transition: border-color var(--dur) var(--ease-out), background var(--dur) var(--ease-out);
}

.type-pick :deep(.el-radio-button__inner:hover) {
  border-color: var(--brand-300) !important;
}

.type-pick :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--brand-50) !important;
  border-color: var(--brand-400) !important;
  color: var(--brand-700);
  box-shadow: none !important;
}

.type-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  text-align: left;
}

.type-opt__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 14px;
}

.type-opt__icon--lost {
  background: var(--coral-50);
  color: var(--coral-600);
}

.type-opt__icon--found {
  background: var(--teal-50);
  color: var(--teal-600);
}

.type-opt__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: inherit;
}

.type-opt__text b {
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.35;
}

.type-opt__text small {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-pick :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) .type-opt__text small {
  color: var(--brand-600);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.publish-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.publish-form :deep(.el-form-item__label) {
  padding-bottom: 4px !important;
}

.field-hint {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.field-hint .el-icon {
  margin-top: 0px;
  flex: none;
}

.form-contact-hint {
  margin-top: -8px;
}

.reward-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0px 0 16px;
  padding: 16px 16px;
  border: 1px solid rgba(245, 166, 35, 0.22);
  border-radius: var(--radius-lg);
  background: var(--amber-50);
}

.reward-editor__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reward-editor__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 8px;
  color: var(--amber-600);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  font-size: 18px;
}

.reward-editor__head > div {
  flex: 1;
  min-width: 0;
}

.reward-editor__head b {
  display: block;
  font-size: 13px;
  color: var(--text-1);
}

.reward-editor__head p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.reward-presets {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.reward-presets :deep(.el-input-number) {
  width: 126px;
  margin-left: auto;
}

.reward-editor__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

.reward-editor__none {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}

.reward-editor__none .el-icon {
  margin-top: 0px;
  flex: none;
  color: var(--amber-600);
}

.preview-reward {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.preview-reward .tag-soft {
  gap: 4px;
}

/* AI 生成条 */
.ai-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px;
  margin: 0px 0 4px;
  border-radius: var(--radius-lg);
  background: var(--brand-50);
  border: 1px solid var(--brand-100);
}

.ai-box__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--surface);
  color: var(--brand-600);
  box-shadow: var(--shadow-xs);
}

.ai-box__main {
  flex: 1;
  min-width: 0;
}

.ai-box__main b {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.ai-box__main p {
  margin: 4px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-3);
}

.ai-box__warn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--amber-600) !important;
}

.ai-box .el-button {
  flex: none;
  margin-left: 0;
}

.ai-note {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0 0px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: var(--fs-xs);
  line-height: 1.6;
}

.tag-select {
  width: 100%;
}

/* 上传 */
.uploader :deep(.el-upload--picture-card) {
  width: 92px;
  height: 92px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--text-3);
  transition: border-color var(--dur), background var(--dur);
}

.uploader :deep(.el-upload--picture-card:hover) {
  border-color: var(--brand-300);
  background: var(--brand-50);
  color: var(--brand-600);
}

.uploader--full :deep(.el-upload--picture-card) {
  display: none;
}

.uploader :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 92px;
  height: 92px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
}

/* 操作 */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.form-actions .el-button {
  margin-left: 0;
  min-width: 108px;
}

/* ---------- 右侧 ---------- */
.publish-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  position: sticky;
  top: 84px;
  align-self: start;
}

.preview-wrap {
  border-radius: var(--radius);
}

.preview-card {
  position: relative;
  overflow: hidden;
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid #ffe3d3;
  background: var(--amber-50);
}

.preview-card--found {
  border-color: var(--teal-100);
  background: var(--teal-50);
}

.preview-card__head {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.preview-card__title {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: 0;
  color: var(--text-1);
}

.preview-card__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.preview-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
}

.preview-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-meta .el-icon {
  color: var(--text-4);
  flex: none;
}

.preview-contact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 23px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  user-select: none;
}

.preview-card__tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.preview-card__image {
  width: 100%;
  max-height: 150px;
  margin-top: 12px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
}

.preview-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.preview-card__foot .tag-soft {
  font-size: 12px;
  height: 22px;
  padding: 0 8px;
}

.preview-meter {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.preview-meter__main {
  min-width: 0;
}

.preview-meter__main b {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.preview-meter__main p {
  margin: 0px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.preview-note {
  margin-top: 12px;
  align-items: flex-start;
  font-size: var(--fs-xs);
}

.preview-note .el-icon {
  margin-top: 0px;
  flex: none;
}

/* 隐私卡 */
.privacy-card {
  padding: 16px 16px;
}

.privacy-card b {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.privacy-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.privacy-list li {
  position: relative;
  padding-left: 12px;
  font-size: var(--fs-xs);
  line-height: 1.65;
  color: var(--text-3);
}

.privacy-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--brand-400);
}

.privacy-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .publish-side {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .type-pick {
    flex-direction: column;
  }

  .type-opt__text small {
    white-space: normal;
  }

  .ai-box {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .ai-box .el-button {
    width: 100%;
  }

  .reward-editor__head {
    flex-wrap: wrap;
  }

  .reward-editor__head :deep(.el-switch) {
    width: 100%;
  }

  .reward-presets :deep(.el-input-number) {
    width: 100%;
    margin-left: 0;
  }

  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 8px;
  }

  .form-actions .el-button {
    width: 100%;
  }

  .preview-card {
    padding: 12px;
  }

  .prefill-notice {
    flex-wrap: wrap;
  }
}
</style>
