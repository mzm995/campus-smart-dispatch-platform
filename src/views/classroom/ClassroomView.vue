<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  Close,
  MagicStick,
  Refresh,
  Search,
  StarFilled,
  Tickets,
  Warning,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import AiBadge from '@/components/AiBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import RecommendCard from './components/RecommendCard.vue'
import RoomCard from './components/RoomCard.vue'
import ApplyDialog from './components/ApplyDialog.vue'
import RoomDrawer from './components/RoomDrawer.vue'
import { useAppStore } from '@/stores/app'
import { useClassroomStore } from '@/stores/classroom'
import { WEEK_CN } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const classroom = useClassroomStore()

const aiText = ref('')
const aiPrefill = ref(false)
const prefillTags = ref([])
const prefillEmpty = ref(false)

const examples = [
  '周三下午 30 人开班会，要投影和空调',
  '周五上午借 60 人讲座教室，要音响',
  '找间 12 人研讨室，下午 4 点，有白板',
]

const campuses = computed(() => [...new Set(classroom.rooms.map((room) => room.campus))])
const capacityPresets = [0, 20, 30, 40, 60, 100, 200]

const dayOptions = computed(() => {
  const days = new Set([1, 2, 3, 4, 5])
  const current = Number(classroom.criteria.day)
  if (current > 5) days.add(current)
  return [...days].sort((a, b) => a - b)
})

const pendingCount = computed(() => classroom.pendingApplications.length)

const recommendationDesc = computed(() => {
  if (classroom.loading) return 'AI 正在核对全部教学场所的课表、容量、设备与距离…'
  if (!classroom.lastCriteria) {
    return '设置条件后点击「AI 推荐教室」，AI 会给出 2–3 间候选，并说明每一条推荐理由。'
  }
  return `基于 ${criteriaText(classroom.lastCriteria)}，从 ${classroom.rooms.length} 处教学场所中筛出 ${classroom.recommendations.length} 处候选。`
})

const criteriaDirty = computed(() => {
  if (!classroom.lastCriteria || classroom.loading) return false
  return normalizeCriteria(classroom.lastCriteria) !== normalizeCriteria(classroom.criteria)
})

/* ---------- AI 需求条 ---------- */
function submitAi() {
  const value = aiText.value.trim()
  if (!value) {
    ElMessage.warning('先用一句话描述需求，例如「周三下午借一间 30 人、带投影的教室」')
    return
  }
  app.openAiDialog(value)
  aiText.value = ''
}

function useExample(text) {
  aiText.value = text
  submitAi()
}

/* ---------- 筛选 ---------- */
function setCampus(value) {
  classroom.setCriteria({ campus: value })
}

function setBuilding(value) {
  classroom.setCriteria({ building: value })
}

function setKind(value) {
  classroom.setCriteria({ kind: value })
}

function setDay(day) {
  classroom.setCriteria({ day })
}

function selectSlot(slot) {
  classroom.setCriteria({ start: slot.start, end: slot.end })
}

function setCapacity(value) {
  classroom.setCriteria({ capacity: value })
}

function togglePurpose(purpose) {
  classroom.setCriteria({
    purpose: classroom.criteria.purpose === purpose ? '' : purpose,
  })
}

function toggleEquipment(item) {
  const list = classroom.criteria.equipment || []
  classroom.setCriteria({
    equipment: list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item],
  })
}

function resetFilters() {
  classroom.setCriteria({
    campus: '',
    building: '',
    kind: '',
    day: 3,
    start: '15:00',
    end: '17:00',
    capacity: 30,
    equipment: [],
    purpose: '',
  })
  classroom.recommendations = []
  classroom.lastCriteria = null
  aiPrefill.value = false
  ElMessage.success('筛选条件已重置')
}

function criteriaText(criteria) {
  if (!criteria) return '默认条件'
  const parts = []
  if (criteria.day) parts.push(WEEK_CN[Number(criteria.day) % 7])
  if (criteria.start && criteria.end) parts.push(`${criteria.start}–${criteria.end}`)
  if (criteria.capacity) parts.push(`${criteria.capacity} 人`)
  if (criteria.campus) parts.push(criteria.campus)
  if (criteria.building) parts.push(criteria.building)
  if (criteria.kind) parts.push(criteria.kind)
  if (criteria.equipment?.length) parts.push(criteria.equipment.join(' / '))
  if (criteria.purpose) parts.push(criteria.purpose)
  return parts.join(' · ') || '默认条件'
}

function normalizeCriteria(criteria) {
  if (!criteria) return ''
  return JSON.stringify({
    campus: criteria.campus || '',
    building: criteria.building || '',
    kind: criteria.kind || '',
    day: Number(criteria.day) || 0,
    start: criteria.start || '',
    end: criteria.end || '',
    capacity: Number(criteria.capacity) || 0,
    equipment: [...(criteria.equipment || [])].sort(),
    purpose: criteria.purpose || '',
  })
}

function relaxEquipment() {
  classroom.setCriteria({ equipment: [] })
  classroom.recommend()
}

async function recommendNow() {
  await classroom.recommend()
}

/* ---------- 教室资源本地筛选 ---------- */
const roomSearch = ref('')
const roomCapacity = ref(0)
const roomFeatures = ref([])
const roomSort = ref('rating')

const sortOptions = [
  { label: '评分优先', value: 'rating' },
  { label: '容量从大到小', value: 'capacity' },
  { label: '距离最近', value: 'distance' },
  { label: '空闲最多', value: 'free' },
]

const filteredRooms = computed(() => {
  const keyword = roomSearch.value.trim().toLowerCase()
  const list = classroom.rooms.filter((room) => {
    if (
      keyword &&
      !`${room.code} ${room.building} ${room.campus} ${room.kind} ${room.className || ''}`
        .toLowerCase()
        .includes(keyword)
    ) {
      return false
    }
    if (roomCapacity.value && room.capacity < roomCapacity.value) return false
    if (roomFeatures.value.length && !roomFeatures.value.every((item) => room.equipment.includes(item))) {
      return false
    }
    return true
  })
  const freeCount = (room) => classroom.freeSlotsOf(room, Number(classroom.criteria.day) || 3).length
  const sorters = {
    rating: (a, b) => b.rating - a.rating,
    capacity: (a, b) => b.capacity - a.capacity,
    distance: (a, b) => a.distance - b.distance,
    free: (a, b) => freeCount(b) - freeCount(a),
  }
  return list.sort(sorters[roomSort.value] || sorters.rating)
})

function toggleRoomFeature(item) {
  roomFeatures.value = roomFeatures.value.includes(item)
    ? roomFeatures.value.filter((entry) => entry !== item)
    : [...roomFeatures.value, item]
}

function resetRoomFilters() {
  roomSearch.value = ''
  roomCapacity.value = 0
  roomFeatures.value = []
  roomSort.value = 'rating'
}

function scrollToRooms() {
  document.getElementById('all-rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ---------- 抽屉 / 申请弹窗 ---------- */
const drawerVisible = ref(false)
const drawerRoom = ref(null)
const drawerDay = ref(3)

const applyVisible = ref(false)
const applyRoom = ref(null)
const applyPrefill = ref({})

function openRoom(room) {
  drawerRoom.value = room
  drawerDay.value = Number(classroom.criteria.day) || 3
  drawerVisible.value = true
}

function openApply(room, preset = {}) {
  if (!room) return
  applyRoom.value = room
  applyPrefill.value = {
    day: Number(preset.day) || Number(classroom.criteria.day) || 3,
    start: preset.start || classroom.criteria.start,
    end: preset.end || classroom.criteria.end,
    people: Number(preset.people) || Number(classroom.criteria.capacity) || 30,
    purpose: preset.purpose || classroom.criteria.purpose || '班会',
  }
  applyVisible.value = true
}

function onDrawerApply(payload) {
  if (!payload?.room) return
  openApply(payload.room, { day: payload.day })
}

/* ---------- AI 预填 ---------- */
function readAiQuery() {
  const query = route.query || {}
  const patch = {}
  const day = Number(query.day)
  if (day >= 1 && day <= 7) patch.day = day

  const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))
  if (isTime(query.start) && isTime(query.end)) {
    patch.start = String(query.start)
    patch.end = String(query.end)
  } else if (isTime(query.start)) {
    const slot = classroom.filters.slots.find((item) => item.start === String(query.start))
    if (slot) {
      patch.start = slot.start
      patch.end = slot.end
    }
  } else if (isTime(query.end)) {
    const slot = classroom.filters.slots.find((item) => item.end === String(query.end))
    if (slot) {
      patch.start = slot.start
      patch.end = slot.end
    }
  }

  const capacity = Number(query.capacity)
  if (String(query.capacity || '') !== '' && Number.isFinite(capacity) && capacity > 0) {
    patch.capacity = capacity
  }

  const equipment = String(query.equipment || '')
    .split(/[,，、\s]+/)
    .filter(Boolean)
  if (equipment.length) patch.equipment = equipment

  const building = String(query.building || '').trim()
  if (building === '东校区' || building === '西校区') patch.campus = building
  else if (classroom.filters.buildings.includes(building)) patch.building = building

  const kind = String(query.kind || '').trim()
  if (classroom.filters.kinds.includes(kind)) patch.kind = kind

  const purpose = String(query.purpose || '').trim()
  if (purpose) patch.purpose = purpose

  return patch
}

function tagsFor(patch) {
  const tags = []
  if (patch.day) tags.push(WEEK_CN[patch.day % 7])
  if (patch.start && patch.end) tags.push(`${patch.start}–${patch.end}`)
  if (patch.capacity) tags.push(`${patch.capacity} 人`)
  if (patch.campus) tags.push(patch.campus)
  if (patch.building) tags.push(patch.building)
  if (patch.kind) tags.push(patch.kind)
  if (patch.purpose) tags.push(patch.purpose)
  if (patch.equipment?.length) tags.push(patch.equipment.join(' / '))
  return tags
}

onMounted(async () => {
  if (String(route.query.from) !== 'ai') return
  const patch = readAiQuery()
  if (Object.keys(patch).length) classroom.setCriteria(patch)
  prefillTags.value = tagsFor(patch)
  prefillEmpty.value = prefillTags.value.length === 0
  aiPrefill.value = true
  await classroom.recommend()
})
</script>

<template>
  <div class="page classroom-page">
    <PageHeader
      title="教室借用"
      :desc="`说清人数、时段与设备，AI 从 ${classroom.rooms.length} 处教学场所中匹配空闲方案，推荐理由可追溯、可一键提交。`"
    >
      <template #actions>
        <el-button @click="router.push('/classroom/status')">
          <el-icon><Tickets /></el-icon>
          我的申请
          <span v-if="pendingCount" class="action-count">{{ pendingCount }}</span>
        </el-button>
      </template>
    </PageHeader>

    <!-- ============ AI 需求条 ============ -->
    <section class="ai-bar">
      <div class="ai-bar__grid" aria-hidden="true"></div>
      <div class="ai-bar__glow ai-bar__glow--a" aria-hidden="true"></div>
      <div class="ai-bar__glow ai-bar__glow--b" aria-hidden="true"></div>

      <div class="ai-bar__body">
        <div class="ai-bar__main">
          <div class="ai-bar__eyebrow">
            <span class="dot dot--brand dot--pulse"></span>
            AI 一句话找教室
            <AiBadge text="意图解析" ghost small />
          </div>
          <h2 class="ai-bar__title">
            说清人数、时间和设备，<span>剩下的交给 AI。</span>
          </h2>
          <div class="ai-bar__input">
            <span class="ai-bar__orb">
              <el-icon :size="17"><MagicStick /></el-icon>
            </span>
            <input
              v-model="aiText"
              class="ai-bar__field"
              placeholder="例如：周三下午 3 点，30 人开班会，要投影和空调"
              maxlength="80"
              @keyup.enter="submitAi"
            />
            <span class="ai-bar__kbd">Enter</span>
            <button type="button" class="ai-bar__submit" @click="submitAi">
              让 AI 推荐
              <el-icon :size="13"><ArrowRight /></el-icon>
            </button>
          </div>
          <div class="ai-bar__examples">
            <span>试试这样说</span>
            <button v-for="example in examples" :key="example" type="button" @click="useExample(example)">
              {{ example }}
            </button>
          </div>
        </div>

        <div class="ai-bar__side">
          <div class="ai-bar__metric">
            <span>可用教学场所</span>
            <b>{{ classroom.stats.rooms }}<small>处</small></b>
          </div>
          <div class="ai-bar__metric">
            <span>覆盖工作日</span>
            <b>5<small>天</small></b>
          </div>
          <div class="ai-bar__metric">
            <span>平均匹配耗时</span>
            <b>0.9<small>s</small></b>
          </div>
          <p class="ai-bar__foot">
            <el-icon :size="12"><CircleCheck /></el-icon>
            已同步本周课表 · 推荐理由可追溯
          </p>
        </div>
      </div>
    </section>

    <!-- ============ AI 预填提示 ============ -->
    <div v-if="aiPrefill" class="notice prefill">
      <span class="prefill__icon">
        <el-icon :size="16"><MagicStick /></el-icon>
      </span>
      <div class="prefill__text">
        <strong>已根据你的描述预填筛选条件</strong>
        <p v-if="!prefillEmpty">识别结果：{{ prefillTags.join(' · ') }}</p>
        <p v-else>未识别到明确条件，已按默认条件（周三 15:00–17:00 · 30 人）为你推荐。</p>
      </div>
      <button type="button" class="prefill__close" aria-label="关闭提示" @click="aiPrefill = false">
        <el-icon :size="14"><Close /></el-icon>
      </button>
    </div>

    <!-- ============ 筛选条件 ============ -->
    <SectionCard title="筛选条件" desc="容量、时段与设备是硬性条件，AI 再按距离与好评综合排序">
      <template #actions>
        <div class="filter-actions">
          <el-button text @click="resetFilters">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
          <el-button type="primary" :loading="classroom.loading" @click="recommendNow">
            <el-icon v-if="!classroom.loading"><MagicStick /></el-icon>
            {{ classroom.loading ? 'AI 匹配中…' : 'AI 推荐教室' }}
          </el-button>
        </div>
      </template>

      <div class="filter-row">
        <span class="filter-row__label">校区</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              type="button"
              class="chip"
              :class="{ 'is-active': !classroom.criteria.campus }"
              @click="setCampus('')"
            >
              全部校区
            </button>
            <button
              v-for="campus in campuses"
              :key="campus"
              type="button"
              class="chip"
              :class="{ 'is-active': classroom.criteria.campus === campus }"
              @click="setCampus(campus)"
            >
              {{ campus }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="classroom.filters.buildings.length > 2" class="filter-row">
        <span class="filter-row__label">楼栋</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              type="button"
              class="chip"
              :class="{ 'is-active': !classroom.criteria.building }"
              @click="setBuilding('')"
            >
              全部楼栋
            </button>
            <button
              v-for="building in classroom.filters.buildings.filter((item) => item !== '全部楼栋')"
              :key="building"
              type="button"
              class="chip"
              :class="{ 'is-active': classroom.criteria.building === building }"
              @click="setBuilding(building)"
            >
              {{ building }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">类型</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              type="button"
              class="chip"
              :class="{ 'is-active': !classroom.criteria.kind }"
              @click="setKind('')"
            >
              全部类型
            </button>
            <button
              v-for="kind in classroom.filters.kinds.filter((item) => item !== '全部类型')"
              :key="kind"
              type="button"
              class="chip"
              :class="{ 'is-active': classroom.criteria.kind === kind }"
              @click="setKind(kind)"
            >
              {{ kind }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">星期</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              v-for="day in dayOptions"
              :key="day"
              type="button"
              class="chip"
              :class="{ 'is-active': Number(classroom.criteria.day) === day }"
              @click="setDay(day)"
            >
              {{ WEEK_CN[day % 7] }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">时段</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              v-for="slot in classroom.filters.slots"
              :key="slot.start"
              type="button"
              class="chip"
              :class="{
                'is-active':
                  classroom.criteria.start === slot.start && classroom.criteria.end === slot.end,
              }"
              @click="selectSlot(slot)"
            >
              {{ slot.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">人数</span>
        <div class="filter-row__control">
          <el-input-number
            v-model="classroom.criteria.capacity"
            :min="0"
            :max="300"
            :step="5"
            controls-position="right"
            class="capacity-input"
          />
          <span class="filter-hint">人起 · 0 表示不限</span>
          <div class="chip-row">
            <button
              v-for="value in capacityPresets"
              :key="value"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': Number(classroom.criteria.capacity) === value }"
              @click="setCapacity(value)"
            >
              {{ value ? `${value} 人` : '不限' }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">用途</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              v-for="purpose in classroom.filters.purposes"
              :key="purpose"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': classroom.criteria.purpose === purpose }"
              @click="togglePurpose(purpose)"
            >
              {{ purpose }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">设备</span>
        <div class="filter-row__control">
          <div class="chip-row">
            <button
              v-for="item in classroom.filters.equipment"
              :key="item"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': classroom.criteria.equipment.includes(item) }"
              @click="toggleEquipment(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>

    <!-- ============ AI 推荐结果 ============ -->
    <section class="page-section rec-section">
      <div class="section-head">
        <div>
          <div class="section-head__title">
            AI 推荐结果
            <AiBadge text="实时计算" ghost small />
          </div>
          <p class="section-head__desc">{{ recommendationDesc }}</p>
        </div>
        <div class="rec-head__actions">
          <span v-if="classroom.recommendations.length && !classroom.loading" class="rec-head__meta">
            <el-icon :size="11"><StarFilled /></el-icon>
            按匹配度排序
          </span>
          <el-button
            v-if="classroom.lastCriteria"
            text
            size="small"
            :loading="classroom.loading"
            @click="recommendNow"
          >
            <el-icon v-if="!classroom.loading"><Refresh /></el-icon>
            重新推荐
          </el-button>
        </div>
      </div>

      <div
        v-if="criteriaDirty && !classroom.loading"
        class="notice notice--amber dirty-note"
      >
        <el-icon :size="14"><Warning /></el-icon>
        <span class="grow">筛选条件已调整，当前结果可能已过期，建议重新计算一次。</span>
        <el-button text size="small" @click="recommendNow">重新计算</el-button>
      </div>

      <!-- loading 骨架 -->
      <div v-if="classroom.loading" class="rec-grid">
        <div v-for="index in 3" :key="index" class="rec-skeleton card">
          <div class="sk sk--pill"></div>
          <div class="rec-skeleton__head">
            <div class="sk sk--art"></div>
            <div class="grow">
              <div class="sk sk--line w70"></div>
              <div class="sk sk--line w50"></div>
            </div>
            <div class="sk sk--ring"></div>
          </div>
          <div class="sk sk--stats"></div>
          <div class="sk sk--line w90"></div>
          <div class="sk sk--line w60"></div>
          <div class="sk sk--block"></div>
        </div>
      </div>

      <!-- 初始状态 -->
      <div v-else-if="!classroom.lastCriteria" class="rec-empty card card--gradient">
        <div class="rec-empty__badge">
          <AiBadge ghost small />
          <span>等待你的需求</span>
        </div>
        <EmptyState
          title="还没有 AI 推荐"
          desc="选好校区、星期、时段和设备，点击「AI 推荐教室」。AI 会先做硬性条件过滤，再按距离与好评给出 2–3 处候选。"
        >
          <template #icon>
            <span class="rec-empty__icon">
              <el-icon :size="24"><MagicStick /></el-icon>
            </span>
          </template>
          <div class="row gap-2 wrap center">
            <el-button type="primary" :loading="classroom.loading" @click="recommendNow">
              <el-icon><MagicStick /></el-icon>
              让 AI 推荐
            </el-button>
            <el-button text @click="scrollToRooms">先自己看看全部场所</el-button>
          </div>
        </EmptyState>
      </div>

      <!-- 推荐结果 -->
      <div v-else-if="classroom.recommendations.length" class="rec-grid">
        <RecommendCard
          v-for="(item, index) in classroom.recommendations"
          :key="item.room.id"
          :item="item"
          :rank="index + 1"
          :criteria="classroom.criteria"
          @apply="openApply"
          @detail="openRoom"
        />
      </div>

      <!-- 无结果 -->
      <div v-else class="rec-empty card">
        <div class="rec-empty__badge">
          <AiBadge ghost small />
          <span>AI 检索完成 · 0 个完全匹配</span>
        </div>
        <EmptyState
          title="没有完全匹配的场所"
          :desc="`按当前条件（${criteriaText(classroom.lastCriteria)}）没有找到完全匹配的教学场所。可以清空设备要求、调整时段，或直接浏览全部教学场所。`"
        >
          <div class="row gap-2 wrap center">
            <el-button v-if="classroom.criteria.equipment.length" @click="relaxEquipment">
              清空设备要求
            </el-button>
            <el-button type="primary" @click="recommendNow">重新推荐</el-button>
            <el-button text @click="scrollToRooms">浏览全部场所</el-button>
          </div>
        </EmptyState>
      </div>

      <div v-if="!classroom.loading && classroom.recommendations.length" class="rec-foot">
        <AiBadge ghost small text="AI 说明" />
        <span>
          推荐结果由课表、容量与设备条件实时计算，提交后仍需管理员人工审核；低置信度结果请以现场情况为准。
        </span>
      </div>
    </section>

    <!-- ============ 全部教学场所 ============ -->
    <section id="all-rooms" class="page-section rooms-section">
      <div class="section-head rooms-head">
        <div>
          <div class="section-head__title">
            全部教学场所
            <span class="rooms-count">
              {{ filteredRooms.length }} / {{ classroom.rooms.length }} 处
            </span>
          </div>
          <p class="section-head__desc">
            点击卡片查看 {{ WEEK_CN[Number(classroom.criteria.day) % 7] }} 课表与空闲时段，卡片下方为当天占用概览。
          </p>
        </div>
        <div class="rooms-tools">
          <el-input v-model="roomSearch" placeholder="搜索房号 / 班级 / 类型" clearable class="rooms-search">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="roomSort" class="rooms-sort">
            <el-option
              v-for="option in sortOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
      </div>

      <div class="rooms-filter card">
        <div class="rooms-filter__row">
          <span class="rooms-filter__label">容量</span>
          <div class="chip-row">
            <button
              v-for="value in capacityPresets"
              :key="`cap-${value}`"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': roomCapacity === value }"
              @click="roomCapacity = value"
            >
              {{ value ? `≥ ${value} 人` : '不限' }}
            </button>
          </div>
        </div>
        <div class="rooms-filter__row">
          <span class="rooms-filter__label">设备</span>
          <div class="chip-row">
            <button
              v-for="item in classroom.filters.equipment"
              :key="`eq-${item}`"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': roomFeatures.includes(item) }"
              @click="toggleRoomFeature(item)"
            >
              {{ item }}
            </button>
            <button
              v-if="roomFeatures.length || roomCapacity || roomSearch"
              type="button"
              class="chip chip--sm rooms-filter__clear"
              @click="resetRoomFilters"
            >
              清空筛选
            </button>
          </div>
        </div>
      </div>

      <div v-if="filteredRooms.length" class="room-grid">
        <RoomCard
          v-for="room in filteredRooms"
          :key="room.id"
          :room="room"
          :day="Number(classroom.criteria.day) || 3"
          @open="openRoom"
        />
      </div>
      <div v-else class="card rooms-empty">
        <EmptyState compact title="没有符合条件的场所" desc="试试放宽容量、类型或设备筛选，或直接搜索房号与班级。">
          <el-button @click="resetRoomFilters">重置资源筛选</el-button>
        </EmptyState>
      </div>
    </section>

    <footer class="class-foot">
      <span>演示数据 · 教学场所与课表均为模拟，不含真实师生信息</span>
      <span>共 {{ classroom.rooms.length }} 处教学场所 · 周一至周五 08:00–21:00 可借</span>
    </footer>

    <RoomDrawer
      v-model="drawerVisible"
      :room="drawerRoom"
      :day="drawerDay"
      @apply="onDrawerApply"
    />
    <ApplyDialog v-model="applyVisible" :room="applyRoom" :prefill="applyPrefill" />
  </div>
</template>

<style scoped>
.classroom-page {
  max-width: var(--content-max);
}

.action-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  margin-left: 2px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--brand-500);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

/* ---------- AI 需求条 ---------- */
.ai-bar {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  background: radial-gradient(130% 130% at 10% 0%, #2c2866 0%, #191c3c 48%, #0e1023 100%);
  color: #fff;
  box-shadow: 0 30px 70px -42px rgba(20, 20, 60, 0.9);
}

.ai-bar__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(80% 80% at 18% 10%, #000 20%, transparent 82%);
}

.ai-bar__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}

.ai-bar__glow--a {
  width: 380px;
  height: 380px;
  top: -160px;
  right: -40px;
  background: rgba(108, 99, 255, 0.38);
}

.ai-bar__glow--b {
  width: 280px;
  height: 280px;
  bottom: -150px;
  left: 28%;
  background: rgba(18, 179, 166, 0.2);
}

.ai-bar__body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(238px, 0.65fr);
  gap: clamp(22px, 4vw, 46px);
  padding: clamp(22px, 2.6vw, 32px) clamp(22px, 3vw, 36px);
}

.ai-bar__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.56);
}

.ai-bar__title {
  margin: 13px 0 0;
  font-size: clamp(22px, 2.25vw, 30px);
  font-weight: 760;
  line-height: 1.32;
  letter-spacing: -0.04em;
}

.ai-bar__title span {
  color: rgba(255, 255, 255, 0.52);
  font-weight: 600;
}

.ai-bar__input {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 19px;
  padding: 7px 7px 7px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.7);
  transition:
    box-shadow 0.2s var(--ease-out),
    border-color 0.2s var(--ease-out);
}

.ai-bar__input:focus-within {
  border-color: rgba(160, 152, 255, 0.9);
  box-shadow:
    0 0 0 4px rgba(108, 99, 255, 0.18),
    0 18px 40px -24px rgba(0, 0, 0, 0.7);
}

.ai-bar__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
}

.ai-bar__field {
  flex: 1;
  min-width: 0;
  padding: 5px 0;
  border: none;
  outline: none;
  background: none;
  font-family: inherit;
  font-size: 13.5px;
  color: #171a2c;
}

.ai-bar__field::placeholder {
  color: #9aa0b4;
}

.ai-bar__kbd {
  flex: none;
  padding: 3px 6px;
  border: 1px solid #e6e6f2;
  border-radius: 6px;
  background: #f6f6fc;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: #9aa0b4;
}

.ai-bar__submit {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 38px;
  padding: 0 15px;
  flex: none;
  border: none;
  border-radius: 11px;
  background: linear-gradient(135deg, #6c63ff, #5a50f0);
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 10px 22px -10px rgba(90, 80, 240, 0.8);
  transition: all 0.2s var(--ease-out);
}

.ai-bar__submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px -10px rgba(90, 80, 240, 0.9);
}

.ai-bar__examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 11px;
}

.ai-bar__examples > span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
}

.ai-bar__examples button {
  max-width: 100%;
  padding: 4px 9px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.68);
  font-family: inherit;
  font-size: 10.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.ai-bar__examples button:hover {
  border-color: rgba(255, 255, 255, 0.26);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.ai-bar__side {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(14px);
}

.ai-bar__metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}

.ai-bar__metric:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.ai-bar__metric span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.ai-bar__metric b {
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.04em;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.ai-bar__metric b small {
  margin-left: 2px;
  font-size: 9px;
  font-weight: 550;
  color: rgba(255, 255, 255, 0.45);
}

.ai-bar__foot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.42);
}

/* ---------- 预填提示 ---------- */
.prefill {
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--brand-100);
  background: linear-gradient(120deg, var(--brand-50), var(--teal-50));
  color: var(--text-2);
}

.prefill__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c63ff, #12b3a6);
  color: #fff;
}

.prefill__text {
  flex: 1;
  min-width: 0;
}

.prefill__text strong {
  display: block;
  font-size: 12.5px;
  font-weight: 680;
  color: var(--text-1);
}

.prefill__text p {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.55;
}

.prefill__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.prefill__close:hover {
  background: rgba(108, 99, 255, 0.08);
  color: var(--brand-600);
}

/* ---------- 筛选 ---------- */
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 11px 0;
}

.filter-row:first-child {
  padding-top: 0;
}

.filter-row:last-child {
  padding-bottom: 0;
}

.filter-row + .filter-row {
  border-top: 1px dashed var(--line);
}

.filter-row__label {
  padding-top: 7px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-3);
  letter-spacing: 0.03em;
}

.filter-row__control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.filter-row .chip {
  font-family: inherit;
}

.filter-hint {
  font-size: 10.5px;
  color: var(--text-3);
}

.capacity-input {
  width: 122px;
  flex: none;
}

/* ---------- 推荐 ---------- */
.rec-head__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rec-head__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-3);
}

.dirty-note {
  align-items: center;
}

.rec-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  align-items: stretch;
}

.rec-empty {
  position: relative;
  padding: 10px;
}

.rec-empty__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding-top: 8px;
  font-size: 10.5px;
  color: var(--text-3);
}

.rec-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 17px;
  background: linear-gradient(135deg, #eeecff, #e6faf7);
  color: var(--brand-500);
  box-shadow: 0 12px 26px -18px rgba(108, 99, 255, 0.8);
}

.rec-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 13px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 10.5px;
  color: var(--text-3);
}

/* ---------- 骨架 ---------- */
.rec-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
}

.rec-skeleton__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sk {
  border-radius: 8px;
  background: linear-gradient(90deg, var(--surface-3) 25%, #fff 37%, var(--surface-3) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--pill {
  width: 64px;
  height: 20px;
  border-radius: 999px;
}

.sk--art {
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 14px;
}

.sk--line {
  height: 11px;
  margin-top: 8px;
}

.sk--line:first-child {
  margin-top: 0;
}

.sk--ring {
  width: 58px;
  height: 58px;
  flex: none;
  border-radius: 50%;
}

.sk--stats {
  height: 54px;
  border-radius: 10px;
}

.sk--block {
  height: 86px;
  border-radius: 10px;
}

.w50 {
  width: 50%;
}

.w60 {
  width: 60%;
}

.w70 {
  width: 70%;
}

.w90 {
  width: 90%;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

/* ---------- 全部教室 ---------- */
.rooms-head {
  align-items: flex-end;
}

.rooms-count {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0;
  color: var(--text-3);
}

.rooms-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rooms-search {
  width: 214px;
}

.rooms-sort {
  width: 142px;
}

.rooms-filter {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 13px 16px;
}

.rooms-filter__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rooms-filter__label {
  flex: none;
  width: 34px;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--text-3);
  letter-spacing: 0.03em;
}

.rooms-filter .chip {
  font-family: inherit;
}

.rooms-filter__clear {
  border-style: dashed;
  color: var(--coral-600);
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(252px, 1fr));
  gap: 14px;
}

.rooms-empty {
  padding: 8px;
}

/* ---------- 页脚 ---------- */
.class-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
  padding: 14px 4px 4px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--text-3);
}

@media (max-width: 900px) {
  .ai-bar__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .ai-bar__side {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 14px;
    padding: 12px 14px;
  }

  .ai-bar__metric {
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding-bottom: 0;
    border-bottom: none;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    padding-left: 14px;
  }

  .ai-bar__metric:first-child {
    border-left: none;
    padding-left: 0;
  }

  .ai-bar__metric b {
    font-size: 19px;
  }

  .ai-bar__foot {
    display: none;
  }
}

@media (max-width: 700px) {
  .ai-bar__body {
    padding: 20px;
  }

  .ai-bar__title {
    font-size: 21px;
  }

  .ai-bar__kbd {
    display: none;
  }

  .ai-bar__submit {
    padding: 0 12px;
    font-size: 12px;
  }

  .filter-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 10px 0;
  }

  .filter-row__label {
    padding-top: 0;
  }

  .rooms-tools,
  .rooms-search,
  .rooms-sort {
    width: 100%;
  }

  .rooms-head {
    align-items: flex-start;
  }

  .room-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .rec-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .class-foot {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

@media (max-width: 430px) {
  .ai-bar__input {
    flex-wrap: wrap;
    gap: 7px;
  }

  .ai-bar__field {
    flex-basis: calc(100% - 40px);
  }

  .ai-bar__submit {
    width: 100%;
    justify-content: center;
  }

  .ai-bar__examples button:nth-of-type(n + 3) {
    display: none;
  }

  .ai-bar__side {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 10px 12px;
  }

  .ai-bar__metric {
    padding-left: 10px;
  }

  .ai-bar__metric span {
    font-size: 9.5px;
  }

  .ai-bar__metric b {
    font-size: 17px;
  }
}
</style>
