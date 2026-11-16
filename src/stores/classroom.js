import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { classrooms, classroomFilters } from '@/mock/seed'
import { apiRequest, apiUrl, getAuthToken } from '@/utils/api'
import { loadState } from '@/utils/storage'
import { recommendClassrooms, roomFreeSlots, sleep } from '@/utils/aiEngine'
import { nextDate, uid } from '@/utils/format'
import { useNotifyStore } from './notify'
import { useUserStore } from './user'

const V = 'v1:classroomApplications'

function nextWeekday(target) {
  const today = dayjs()
  const current = today.day() === 0 ? 7 : today.day()
  let diff = target - current
  if (diff <= 0) diff += 7
  return today.add(diff, 'day')
}

function seedApplications() {
  const user = useUserStore()
  const applicant = user.user?.name || '林小满'
  const applicantId = user.user?.id || ''
  const wed = nextWeekday(3)
  const fri = nextWeekday(5)
  return [
    {
      id: 'ap_seed_001',
      roomId: 'cr_1222',
      roomCode: '1222',
      building: 'A栋',
      campus: '东校区',
      date: wed.format('YYYY-MM-DD'),
      day: 3,
      start: '15:00',
      end: '17:00',
      purpose: '班会',
      people: 30,
      applicant,
      applicantId,
      contact: '站内联系',
      note: '需要投影展示班级总结，提前 10 分钟到场。',
      status: 'approved',
      aiReason: '容量 46 人 ≥ 30 人，配备投影与空调，周三 15:00–17:00 空闲，距 A 栋约 210m。',
      createdAt: dayjs().subtract(2, 'hour').toISOString(),
      reviewedAt: dayjs().subtract(1, 'hour').toISOString(),
      timeline: [],
    },
    {
      id: 'ap_seed_002',
      roomId: 'cr_1315',
      roomCode: '1315',
      building: 'A栋',
      campus: '东校区',
      date: fri.format('YYYY-MM-DD'),
      day: 5,
      start: '10:00',
      end: '12:00',
      purpose: '讲座',
      people: 45,
      applicant,
      applicantId,
      contact: '站内联系',
      note: '社团分享会，需要投影与空调。',
      status: 'pending',
      aiReason: '容量 55 人 ≥ 45 人，配备投影与空调，周五 10:00–12:00 空闲。',
      createdAt: dayjs().subtract(40, 'minute').toISOString(),
      reviewedAt: null,
      timeline: [],
    },
  ]
}

function dateOfBlock(block) {
  const date = new Date(block.startsAt)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function timeOfBlock(block, edge) {
  const date = new Date(edge === 'end' ? block.endsAt : block.startsAt)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function weekdayOfDate(value) {
  const day = dayjs(value).day()
  return day === 0 ? 7 : day
}

export const useClassroomStore = defineStore('classroom', () => {
  const user = useUserStore()
  const rooms = ref(classrooms.map((room) => ({ ...room, busy: [...(room.busy || [])] })))
  const storedApplications = loadState(V, seedApplications())
  const applications = ref(Array.isArray(storedApplications) ? storedApplications : [])
  const roomBlocks = ref([])
  const availabilityVersion = ref(0)
  const availabilityReady = ref(false)
  const syncing = ref(false)
  const syncError = ref('')
  const eventConnected = ref(false)
  const criteria = ref({
    campus: '',
    building: '',
    kind: '',
    day: 3,
    date: nextDate(3).format('YYYY-MM-DD'),
    start: '15:00',
    end: '17:00',
    capacity: 30,
    equipment: [],
    purpose: '',
  })
  const lastCriteria = ref(null)
  const recommendations = ref([])
  const loading = ref(false)
  let seq = 0
  let eventSource = null
  let refreshTimer = null
  let activeHydrate = null

  const filters = computed(() => classroomFilters)
  const pendingApplications = computed(() =>
    applications.value.filter((item) => item.status === 'pending'),
  )
  const approvedApplications = computed(() =>
    applications.value.filter((item) => item.status === 'approved'),
  )
  const stats = computed(() => ({
    total: applications.value.length,
    pending: pendingApplications.value.length,
    approved: approvedApplications.value.length,
    rooms: rooms.value.length,
  }))

  function getRoom(id) {
    return rooms.value.find((room) => room.id === id) || null
  }

  function getApplication(id) {
    return applications.value.find((item) => item.id === id) || null
  }

  function blocksForRoom(room, day, date = '') {
    if (!room) return []
    return roomBlocks.value.filter((block) => {
      if (block.roomId !== room.id) return false
      if (date) return dateOfBlock(block) === date
      return weekdayOfDate(block.startsAt) === Number(day)
    })
  }

  function roomWithBlocks(room, day, date = '') {
    const dynamicBusy = blocksForRoom(room, day, date).map((block) => ({
      day: weekdayOfDate(block.startsAt),
      date: dateOfBlock(block),
      start: timeOfBlock(block, 'start'),
      end: timeOfBlock(block, 'end'),
      label:
        block.sourceType === 'application'
          ? block.status === 'tentative'
            ? '借用审核中'
            : '借用已批准'
          : block.sourceType === 'maintenance'
            ? '维护占用'
            : '课程安排',
      sourceType: block.sourceType,
      status: block.status,
    }))
    return {
      ...room,
      busy: [...(availabilityReady.value ? [] : room.busy || []), ...dynamicBusy],
    }
  }

  function freeSlotsOf(room, day, date = '') {
    return roomFreeSlots(roomWithBlocks(room, day || 3, date), day || 3)
  }

  function roomFreeAt(room, day, start, end, date = '') {
    const target = roomWithBlocks(room, day, date)
    return !(target.busy || []).some((busy) => {
      if (date && busy.date && busy.date !== date) return false
      return busy.start < end && busy.end > start
    })
  }

  function blockAt(room, day, start, end, date = '') {
    return blocksForRoom(room, day, date).find((block) => {
      const blockStart = timeOfBlock(block, 'start')
      const blockEnd = timeOfBlock(block, 'end')
      return blockStart < end && blockEnd > start
    }) || null
  }

  function replaceApplication(application) {
    if (!application?.id) return
    const index = applications.value.findIndex((item) => item.id === application.id)
    if (index >= 0) applications.value.splice(index, 1, application)
    else applications.value.unshift(application)
  }

  async function refreshAvailability({ quiet = false } = {}) {
    if (!user.canAccess('classroom')) return
    if (!quiet) syncing.value = true
    try {
      const from = dayjs().format('YYYY-MM-DD')
      const to = dayjs().add(60, 'day').format('YYYY-MM-DD')
      const data = await apiRequest(
        `/classroom/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      roomBlocks.value = Array.isArray(data.blocks) ? data.blocks : []
      availabilityVersion.value = Number(data.availabilityVersion) || 0
      availabilityReady.value = true
      syncError.value = ''
    } catch (error) {
      syncError.value = error?.message || '教室占用同步失败'
      availabilityReady.value = false
      if (!quiet) throw error
    } finally {
      if (!quiet) syncing.value = false
    }
  }

  async function refreshApplications({ quiet = false } = {}) {
    if (!user.canAccess('classroom')) return []
    try {
      const data = await apiRequest('/classroom/applications')
      if (Array.isArray(data.applications)) applications.value = data.applications
      return applications.value
    } catch (error) {
      syncError.value = error?.message || '教室申请同步失败'
      if (!quiet) throw error
      return applications.value
    }
  }

  async function hydrate({ force = false } = {}) {
    if (!user.isLoggedIn || !user.canAccess('classroom')) return
    if (activeHydrate && !force) return activeHydrate
    activeHydrate = Promise.all([
      refreshAvailability(),
      refreshApplications(),
    ]).finally(() => {
      activeHydrate = null
    })
    return activeHydrate
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => {
      refreshAvailability({ quiet: true })
      refreshApplications({ quiet: true }).then(() => {
        if (lastCriteria.value) recommend(lastCriteria.value)
      })
    }, 120)
  }

  function stopEvents() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    eventConnected.value = false
    window.clearTimeout(refreshTimer)
  }

  function connectEvents() {
    if (eventSource || !user.isLoggedIn || !user.canAccess('classroom')) return
    const token = getAuthToken()
    if (!token || typeof EventSource === 'undefined') return
    eventSource = new EventSource(
      apiUrl(`/classroom/events?token=${encodeURIComponent(token)}`),
    )
    eventSource.addEventListener('ready', () => {
      eventConnected.value = true
      scheduleRefresh()
    })
    eventSource.addEventListener('occupancy', () => {
      eventConnected.value = true
      scheduleRefresh()
    })
    eventSource.onerror = () => {
      eventConnected.value = false
    }
  }

  function setCriteria(patch) {
    const next = { ...criteria.value, ...patch }
    if ('day' in patch) next.date = nextDate(Number(patch.day) || 3).format('YYYY-MM-DD')
    criteria.value = next
  }

  async function recommend(input) {
    const merged = { ...criteria.value, ...(input || {}) }
    if (merged.campus === '全部校区') merged.campus = ''
    if (merged.building === '全部楼栋') merged.building = ''
    criteria.value = merged
    lastCriteria.value = JSON.parse(JSON.stringify(merged))
    loading.value = true
    const job = ++seq
    await sleep(420)
    await refreshAvailability({ quiet: true })
    if (job !== seq) return recommendations.value
    const augmented = rooms.value.map((room) =>
      roomWithBlocks(room, merged.day, merged.date),
    )
    recommendations.value = recommendClassrooms(augmented, merged)
    loading.value = false
    return recommendations.value
  }

  async function apply(payload) {
    if (!user.canAccess('classroom')) throw new Error('当前角色无权借用教室')
    const data = await apiRequest('/classroom/applications', {
      method: 'POST',
      body: {
        ...payload,
        idempotencyKey:
          payload.idempotencyKey || `classroom:${uid('submit')}`,
      },
      timeoutMs: 15_000,
    })
    replaceApplication(data.application)
    availabilityVersion.value = Math.max(
      availabilityVersion.value,
      Number(data.availabilityVersion) || 0,
    )
    await refreshAvailability({ quiet: true })
    useNotifyStore().add({
      type: 'status',
      title: '教室申请已提交',
      content: `${data.application.building} ${data.application.roomCode} · ${data.application.date} ${data.application.start}–${data.application.end} 已建立临时占用。`,
      link: `/classroom/status/${data.application.id}`,
      sourceType: 'classroom',
      sourceId: data.application.id,
    })
    return data.application
  }

  async function review(id, action, reason = '') {
    const data = await apiRequest(`/classroom/applications/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: { action, reason },
    })
    replaceApplication(data.application)
    availabilityVersion.value = Math.max(
      availabilityVersion.value,
      Number(data.availabilityVersion) || 0,
    )
    await refreshAvailability({ quiet: true })
    return data.application
  }

  async function approve(id) {
    return review(id, 'approve', '审核通过')
  }

  async function reject(id, reason = '该时段已被其他活动占用') {
    return review(id, 'reject', reason)
  }

  async function cancel(id, reason = '申请人取消') {
    const data = await apiRequest(`/classroom/applications/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { reason },
    })
    replaceApplication(data.application)
    availabilityVersion.value = Math.max(
      availabilityVersion.value,
      Number(data.availabilityVersion) || 0,
    )
    await refreshAvailability({ quiet: true })
    return data.application
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('campus-smart-dispatch-platform:session-ready', () => {
      hydrate({ force: true }).then(connectEvents).catch(() => {})
    })
    window.addEventListener('campus-smart-dispatch-platform:session-clear', () => {
      stopEvents()
      applications.value = []
      roomBlocks.value = []
      availabilityVersion.value = 0
      availabilityReady.value = false
    })
    window.addEventListener('focus', () => {
      if (user.isLoggedIn && user.canAccess('classroom')) {
        refreshAvailability({ quiet: true })
        refreshApplications({ quiet: true })
      }
    })
    window.setTimeout(() => {
      if (user.isLoggedIn && user.canAccess('classroom')) {
        hydrate().then(connectEvents).catch(() => {})
      }
    }, 0)
  }

  return {
    rooms,
    applications,
    roomBlocks,
    availabilityVersion,
    availabilityReady,
    syncing,
    syncError,
    eventConnected,
    criteria,
    lastCriteria,
    recommendations,
    loading,
    filters,
    pendingApplications,
    approvedApplications,
    stats,
    getRoom,
    getApplication,
    freeSlotsOf,
    roomFreeAt,
    blockAt,
    refreshAvailability,
    refreshApplications,
    hydrate,
    connectEvents,
    stopEvents,
    setCriteria,
    recommend,
    apply,
    approve,
    reject,
    cancel,
  }
})
