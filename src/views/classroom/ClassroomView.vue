<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
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

function submitAi() {
  const text = aiText.value.trim()
  if (!text) {
    ElMessage.warning('先用一句话描述需求，例如「周三下午借一间 30 人、带投影的教室」')
    return
  }
  app.openAiDialog(text)
  aiText.value = ''
}

function useExample(item) {
  aiText.value = item
  submitAi()
}

function setCampus(value) {
  classroom.setCriteria({ campus: value })
}

function setBuilding(value) {
  classroom.setCriteria({ building: value })
}

function setKind(value) {
  classroom.setCriteria({ kind: value })
}

function setDay(value) {
  classroom.setCriteria({ day: value })
}

function setSlot(slot) {
  classroom.setCriteria({ start: slot.start, end: slot.end })
}

function setCapacity(value) {
  classroom.setCriteria({ capacity: value })
}

function setPurpose(value) {
  classroom.setCriteria({ purpose: classroom.criteria.purpose === value ? '' : value })
}

function toggleEquipment(value) {
  const current = classroom.criteria.equipment || []
  classroom.setCriteria({
    equipment: current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  })
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

function resetCriteria() {
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

function clearEquipmentAndRecommend() {
  classroom.setCriteria({ equipment: [] })
  classroom.recommend()
}

async function recommend() {
  await classroom.recommend()
}

/* ---------- 全部场所筛选 ---------- */
const roomSearch = ref('')
const roomCapacity = ref(0)
const roomEquipment = ref([])
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
    if (
      roomEquipment.value.length &&
      !roomEquipment.value.every((item) => room.equipment.includes(item))
    ) {
      return false
    }
    return true
  })

  const freeCount = (room) =>
    classroom.freeSlotsOf(
      room,
      Number(classroom.criteria.day) || 3,
      classroom.criteria.date,
    ).length
  const sorters = {
    rating: (a, b) => b.rating - a.rating,
    capacity: (a, b) => b.capacity - a.capacity,
    distance: (a, b) => a.distance - b.distance,
    free: (a, b) => freeCount(b) - freeCount(a),
  }

  return list.sort(sorters[roomSort.value] || sorters.rating)
})

function toggleRoomEquipment(value) {
  roomEquipment.value = roomEquipment.value.includes(value)
    ? roomEquipment.value.filter((item) => item !== value)
    : [...roomEquipment.value, value]
}

function resetRoomFilters() {
  roomSearch.value = ''
  roomCapacity.value = 0
  roomEquipment.value = []
  roomSort.value = 'rating'
}

function scrollToRooms() {
  document.getElementById('all-rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ---------- 抽屉 / 申请 ---------- */
const drawerOpen = ref(false)
const activeRoom = ref(null)
const drawerDay = ref(3)
const applyOpen = ref(false)
const applyRoom = ref(null)
const applyPrefill = ref({})

function openRoom(room) {
  activeRoom.value = room
  drawerDay.value = Number(classroom.criteria.day) || 3
  drawerOpen.value = true
}

function openApply(room, options = {}) {
  if (!room) return
  applyRoom.value = room
  applyPrefill.value = {
    day: Number(options.day) || Number(classroom.criteria.day) || 3,
    start: options.start || classroom.criteria.start,
    end: options.end || classroom.criteria.end,
    people: Number(options.people) || Number(classroom.criteria.capacity) || 30,
    purpose: options.purpose || classroom.criteria.purpose || '班会',
  }
  applyOpen.value = true
}

function handleDrawerApply(payload) {
  if (payload?.room) openApply(payload.room, { day: payload.day })
}

/* ---------- 从 AI 链接带入条件 ---------- */
function parseQuery() {
  const query = route.query || {}
  const result = {}
  const day = Number(query.day)
  if (day >= 1 && day <= 7) result.day = day

  const isTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''))
  if (isTime(query.start) && isTime(query.end)) {
    result.start = String(query.start)
    result.end = String(query.end)
  } else if (isTime(query.start)) {
    const slot = classroom.filters.slots.find((item) => item.start === String(query.start))
    if (slot) {
      result.start = slot.start
      result.end = slot.end
    }
  } else if (isTime(query.end)) {
    const slot = classroom.filters.slots.find((item) => item.end === String(query.end))
    if (slot) {
      result.start = slot.start
      result.end = slot.end
    }
  }

  const capacity = Number(query.capacity)
  if (String(query.capacity || '') !== '' && Number.isFinite(capacity) && capacity > 0) {
    result.capacity = capacity
  }

  const equipment = String(query.equipment || '')
    .split(/[,，、\s]+/)
    .filter(Boolean)
  if (equipment.length) result.equipment = equipment

  const building = String(query.building || '').trim()
  if (building === '东校区' || building === '西校区') {
    result.campus = building
  } else if (classroom.filters.buildings.includes(building)) {
    result.building = building
  }

  const kind = String(query.kind || '').trim()
  if (classroom.filters.kinds.includes(kind)) result.kind = kind

  const purpose = String(query.purpose || '').trim()
  if (purpose) result.purpose = purpose

  return result
}

function queryTags(criteria) {
  const tags = []
  if (criteria.day) tags.push(WEEK_CN[criteria.day % 7])
  if (criteria.start && criteria.end) tags.push(`${criteria.start}–${criteria.end}`)
  if (criteria.capacity) tags.push(`${criteria.capacity} 人`)
  if (criteria.campus) tags.push(criteria.campus)
  if (criteria.building) tags.push(criteria.building)
  if (criteria.kind) tags.push(criteria.kind)
  if (criteria.purpose) tags.push(criteria.purpose)
  if (criteria.equipment?.length) tags.push(criteria.equipment.join(' / '))
  return tags
}

onMounted(async () => {
  if (String(route.query.from) !== 'ai') return
  const parsed = parseQuery()
  if (Object.keys(parsed).length) classroom.setCriteria(parsed)
  prefillTags.value = queryTags(parsed)
  prefillEmpty.value = prefillTags.value.length === 0
  aiPrefill.value = true
  await classroom.recommend()
})
</script>

<template>
  <div class="page classroom-page">
    <PageHeader
      eyebrow="场景 01 · 资源匹配"
      title="教室借用"
      :desc="`从 ${classroom.rooms.length} 处教学场所中，按课表、容量、设备与距离挑一间合适的。`"
    >
      <template #actions>
        <el-button @click="router.push('/classroom/status')">
          <el-icon><Tickets /></el-icon>
          申请与审核
          <span v-if="pendingCount" class="action-count">{{ pendingCount }}</span>
        </el-button>
      </template>
    </PageHeader>

    <section class="ai-bar">
      <div class="ai-bar__body">
        <div class="ai-bar__main">
          <div class="ai-bar__eyebrow">
            <span class="dot" />
            AI 一句话找教室
            <AiBadge text="自然语言" small />
          </div>
          <h2 class="ai-bar__title">把需求说清楚，<span>剩下的交给课表。</span></h2>
          <div class="ai-bar__input">
            <span class="ai-bar__orb">
              <el-icon><MagicStick /></el-icon>
            </span>
            <input
              v-model="aiText"
              class="ai-bar__field"
              maxlength="80"
              placeholder="例如：周三下午 30 人开班会，要投影和空调"
              @keyup.enter="submitAi"
            />
            <span class="ai-bar__kbd">Enter</span>
            <button type="button" class="ai-bar__submit" @click="submitAi">
              解析需求
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
          <div class="ai-bar__examples">
            <span>试试：</span>
            <button
              v-for="item in examples"
              :key="item"
              type="button"
              @click="useExample(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <aside class="ai-bar__side">
          <div class="ai-bar__metric">
            <span>可用教学场所</span>
            <b>{{ classroom.stats.rooms }}</b>
            <em>处</em>
          </div>
          <div class="ai-bar__metric">
            <span>覆盖工作日</span>
            <b>5</b>
            <em>天</em>
          </div>
          <div class="ai-bar__metric">
            <span>平均匹配耗时</span>
            <b>0.9</b>
            <em>s</em>
          </div>
          <p class="ai-bar__foot">AI 只做筛选与排序，具体借用仍需管理员审核。</p>
        </aside>
      </div>
    </section>

    <div v-if="aiPrefill" class="notice prefill">
      <span class="prefill__icon">
        <el-icon><MagicStick /></el-icon>
      </span>
      <div class="prefill__text">
        <strong>{{ prefillEmpty ? '未能从这句话中识别出条件' : '已按你的描述填入筛选条件' }}</strong>
        <p>
          {{
            prefillEmpty
              ? '可以补充人数、时段或设备，也可以直接手动筛选。'
              : `识别结果：${prefillTags.join(' · ')}`
          }}
        </p>
      </div>
      <button class="prefill__close" type="button" aria-label="关闭" @click="aiPrefill = false">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <SectionCard title="筛选条件" desc="容量、时段与设备是硬性条件，其余用于排序与说明。">
      <template #actions>
        <div class="filter-actions">
          <el-button @click="resetCriteria">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
          <el-button type="primary" :loading="classroom.loading" @click="recommend">
            <el-icon v-if="!classroom.loading"><MagicStick /></el-icon>
            {{ classroom.loading ? 'AI 匹配中…' : 'AI 推荐教室' }}
          </el-button>
        </div>
      </template>

      <div class="filter-row">
        <span class="filter-row__label">校区</span>
        <div class="filter-row__control">
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

      <div v-if="classroom.filters.buildings.length > 2" class="filter-row">
        <span class="filter-row__label">楼栋</span>
        <div class="filter-row__control">
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

      <div class="filter-row">
        <span class="filter-row__label">类型</span>
        <div class="filter-row__control">
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

      <div class="filter-row">
        <span class="filter-row__label">星期</span>
        <div class="filter-row__control">
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

      <div class="filter-row">
        <span class="filter-row__label">时段</span>
        <div class="filter-row__control">
          <button
            v-for="slot in classroom.filters.slots"
            :key="slot.start"
            type="button"
            class="chip"
            :class="{
              'is-active':
                classroom.criteria.start === slot.start && classroom.criteria.end === slot.end,
            }"
            @click="setSlot(slot)"
          >
            {{ slot.label }}
          </button>
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
          <button
            v-for="preset in capacityPresets"
            :key="preset"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': Number(classroom.criteria.capacity) === preset }"
            @click="setCapacity(preset)"
          >
            {{ preset ? `${preset} 人` : '不限' }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">用途</span>
        <div class="filter-row__control">
          <button
            v-for="purpose in classroom.filters.purposes"
            :key="purpose"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': classroom.criteria.purpose === purpose }"
            @click="setPurpose(purpose)"
          >
            {{ purpose }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-row__label">设备</span>
        <div class="filter-row__control">
          <button
            v-for="equipment in classroom.filters.equipment"
            :key="equipment"
            type="button"
            class="chip chip--sm"
            :class="{ 'is-active': classroom.criteria.equipment.includes(equipment) }"
            @click="toggleEquipment(equipment)"
          >
            {{ equipment }}
          </button>
        </div>
      </div>
    </SectionCard>

    <section class="page-section rec-section">
      <div class="section-head">
        <div>
          <h2 class="section-head__title">
            AI 推荐结果
            <AiBadge text="实时计算" ghost small />
          </h2>
          <p class="section-head__desc">{{ recommendationDesc }}</p>
        </div>
        <div class="rec-head__actions">
          <span v-if="classroom.recommendations.length && !classroom.loading" class="rec-head__meta">
            <el-icon><StarFilled /></el-icon>
            按匹配度排序
          </span>
          <el-button
            v-if="classroom.lastCriteria"
            size="small"
            :loading="classroom.loading"
            @click="recommend"
          >
            <el-icon v-if="!classroom.loading"><Refresh /></el-icon>
            重新推荐
          </el-button>
        </div>
      </div>

      <div v-if="criteriaDirty && !classroom.loading" class="notice notice--amber dirty-note">
        <el-icon><Warning /></el-icon>
        <span class="grow">筛选条件已调整，当前结果可能已过期，建议重新计算一次。</span>
        <el-button size="small" @click="recommend">重新计算</el-button>
      </div>

      <div v-if="classroom.loading" class="rec-grid">
        <div v-for="index in 3" :key="index" class="rec-skeleton card">
          <div class="sk sk--pill" />
          <div class="rec-skeleton__head">
            <div class="sk sk--art" />
            <div class="grow">
              <div class="sk sk--line w70" />
              <div class="sk sk--line w50" />
            </div>
            <div class="sk sk--ring" />
          </div>
          <div class="sk sk--stats" />
          <div class="sk sk--line w90" />
          <div class="sk sk--line w60" />
          <div class="sk sk--block" />
        </div>
      </div>

      <template v-else-if="classroom.lastCriteria">
        <div v-if="classroom.recommendations.length" class="rec-grid">
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
        <div v-else class="rec-empty card">
          <div class="rec-empty__badge">
            <AiBadge ghost small />
            <span>AI 检索完成 · 0 个完全匹配</span>
          </div>
          <EmptyState
            title="没有完全匹配的场所"
            :desc="`按当前条件（${criteriaText(classroom.lastCriteria)}）没有找到完全匹配的教学场所。可以清空设备要求、调整时段，或直接浏览全部教学场所。`"
          >
            <div class="filter-actions">
              <el-button v-if="classroom.criteria.equipment.length" @click="clearEquipmentAndRecommend">
                清空设备要求
              </el-button>
              <el-button type="primary" @click="recommend">重新推荐</el-button>
              <el-button text @click="scrollToRooms">浏览全部场所</el-button>
            </div>
          </EmptyState>
        </div>
      </template>

      <div v-else class="rec-empty card">
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
              <el-icon><MagicStick /></el-icon>
            </span>
          </template>
          <div class="filter-actions">
            <el-button type="primary" :loading="classroom.loading" @click="recommend">
              <el-icon><MagicStick /></el-icon>
              让 AI 推荐
            </el-button>
            <el-button text @click="scrollToRooms">先自己看看全部场所</el-button>
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

    <section id="all-rooms" class="page-section rooms-section">
      <div class="section-head rooms-head">
        <div>
          <h2 class="section-head__title">
            全部教学场所
            <span class="rooms-count">{{ filteredRooms.length }} / {{ classroom.rooms.length }} 处</span>
          </h2>
          <p class="section-head__desc">
            点击卡片查看 {{ WEEK_CN[Number(classroom.criteria.day) % 7] }} 课表与空闲时段，卡片下方为当天占用概览。
          </p>
        </div>
        <div class="rooms-tools">
          <el-input
            v-model="roomSearch"
            placeholder="搜索房号 / 班级 / 类型"
            clearable
            class="rooms-search"
          >
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
          <div class="filter-row__control">
            <button
              v-for="preset in capacityPresets"
              :key="`cap-${preset}`"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': roomCapacity === preset }"
              @click="roomCapacity = preset"
            >
              {{ preset ? `≥ ${preset} 人` : '不限' }}
            </button>
          </div>
        </div>

        <div class="rooms-filter__row">
          <span class="rooms-filter__label">设备</span>
          <div class="filter-row__control">
            <button
              v-for="equipment in classroom.filters.equipment"
              :key="`eq-${equipment}`"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': roomEquipment.includes(equipment) }"
              @click="toggleRoomEquipment(equipment)"
            >
              {{ equipment }}
            </button>
            <button
              v-if="roomEquipment.length || roomCapacity || roomSearch"
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
            :date="classroom.criteria.date"
            @open="openRoom"
          />
      </div>
      <div v-else class="rooms-empty card">
        <EmptyState
          compact
          title="没有符合条件的场所"
          desc="试试放宽容量、类型或设备筛选，或直接搜索房号与班级。"
        >
          <el-button @click="resetRoomFilters">重置资源筛选</el-button>
        </EmptyState>
      </div>
    </section>

    <footer class="class-foot">
      <span>演示数据 · 教学场所与课表均为模拟，不含真实师生信息</span>
      <span>共 {{ classroom.rooms.length }} 处教学场所 · 周一至周五 08:00–21:00 可借</span>
    </footer>

    <RoomDrawer
      v-model="drawerOpen"
      :room="activeRoom"
      :day="drawerDay"
      :date="classroom.criteria.date"
      @apply="handleDrawerApply"
    />
    <ApplyDialog v-model="applyOpen" :room="applyRoom" :prefill="applyPrefill" />
  </div>
</template>

<style scoped>
/* ---------- AI 需求条：浅底、左重右轻 ---------- */
.ai-bar {
  position: relative;
  overflow: visible;
  border-radius: 0;
  border-bottom: 1px solid var(--line-strong);
  background: transparent;
  color: var(--text-1);
  box-shadow: none;
}

/* 左侧 2px 竖线：给零底色的 AI 区块一个锚点，与右侧描边面板同量级；
   线落在页边距里，不改变任何内容的左右对齐 */
.ai-bar::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -16px;
  width: 2px;
  border-radius: 2px;
  background: var(--brand-400);
}

.ai-bar__body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.75fr);
  gap: clamp(32px, 5vw, 48px);
  padding: 24px 0 32px;
}

.ai-bar__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.ai-bar__title {
  margin: 16px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(24px, 2.4vw, 32px);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
  color: var(--text-1);
}

.ai-bar__title span {
  color: var(--text-3);
  font-weight: 400;
}

.ai-bar__input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 4px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  box-shadow: none;
  transition:
    box-shadow var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.ai-bar__input:focus-within {
  border-color: var(--brand-500);
  box-shadow: 0 0 0 3px var(--brand-50);
}

.ai-bar__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--brand-600);
  color: var(--text-invert);
}

.ai-bar__field {
  flex: 1;
  min-width: 0;
  padding: 4px 0;
  border: none;
  outline: none;
  background: none;
  font-family: inherit;
  font-size: var(--fs-base);
  color: var(--text-1);
}

.ai-bar__field::placeholder {
  color: var(--text-4);
}

.ai-bar__kbd {
  flex: none;
  padding: 0px 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.ai-bar__submit {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 16px;
  flex: none;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--brand-600);
  color: var(--text-invert);
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.ai-bar__submit:hover {
  background: var(--brand-700);
}

.ai-bar__examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
}

.ai-bar__examples > span {
  font-size: var(--fs-xs);
  color: var(--text-4);
}

.ai-bar__examples button {
  max-width: 100%;
  padding: 4px 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: var(--fs-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.ai-bar__examples button:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
  color: var(--text-1);
}

.ai-bar__side {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  align-self: center;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.ai-bar__metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.ai-bar__metric:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.ai-bar__metric span {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.ai-bar__metric b {
  font-family: var(--font-serif);
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.ai-bar__metric b small {
  margin-left: 0px;
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--text-3);
}

.ai-bar__foot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

/* ---------- 预填提示 ---------- */
.prefill {
  align-items: center;
  padding: 12px 12px;
  border: 1px solid var(--brand-100);
  background: var(--brand-50);
  color: var(--text-2);
}

.prefill__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: var(--brand-600);
  color: #fff;
}

.prefill__text {
  flex: 1;
  min-width: 0;
}

.prefill__text strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.prefill__text p {
  margin: 4px 0 0;
  font-size: 12px;
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
  background: var(--brand-50);
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
  padding: 8px 0;
}

.filter-row:first-child {
  padding-top: 0;
}

.filter-row:last-child {
  padding-bottom: 0;
}

.filter-row + .filter-row {
  border-top: 1px solid var(--line);
}

.filter-row__label {
  padding-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0;
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
  font-size: 12px;
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
  gap: 8px;
  flex-wrap: wrap;
}

.rec-head__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
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
  padding: 8px;
}

.rec-empty__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.rec-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-500);
  box-shadow: none;
}

.rec-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 12px;
  color: var(--text-3);
}

/* ---------- 骨架 ---------- */
.rec-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.rec-skeleton__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sk {
  border-radius: 8px;
  background: linear-gradient(90deg, var(--surface-3) 25%, var(--surface-2) 37%, var(--surface-3) 63%);
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
  border-radius: 8px;
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
  border-radius: 8px;
}

.sk--block {
  height: 86px;
  border-radius: 8px;
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
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  font-size: 12px;
  font-weight: 600;
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
  gap: 8px;
  padding: 12px 16px;
}

.rooms-filter__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rooms-filter__label {
  flex: none;
  width: 34px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.03em;
}

.rooms-filter .chip {
  font-family: inherit;
}

.rooms-filter__clear {
  border-style: solid;
  color: var(--coral-600);
}

.room-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  border-top: 1px solid var(--line);
}

.rooms-empty {
  padding: 8px;
}

/* ---------- 页脚 ---------- */
.class-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
  padding: 12px 4px 4px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 900px) {
  /* 页边距收窄到 16px，竖线跟着内收，仍保持在内容左缘之外 */
  .ai-bar::before {
    left: -8px;
  }

  .ai-bar__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .ai-bar__side {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 12px;
    padding: 12px 12px;
  }

  .ai-bar__metric {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding-bottom: 0;
    border-bottom: none;
    border-left: 1px solid var(--line);
    padding-left: 12px;
  }

  .ai-bar__metric:first-child {
    border-left: none;
    padding-left: 0;
  }

  .ai-bar__metric b {
    font-size: 18px;
  }

  .ai-bar__foot {
    display: none;
  }
}

@media (max-width: 700px) {
  .ai-bar__body {
    padding: 16px 0 24px;
  }

  .ai-bar__title {
    font-size: 20px;
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
    gap: 4px;
    padding: 8px 0;
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
    gap: 8px;
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
    padding: 8px 12px;
  }

  .ai-bar__metric {
    padding-left: 8px;
  }

  .ai-bar__metric span {
    font-size: 12px;
  }

  .ai-bar__metric b {
    font-size: 18px;
  }
}
</style>
