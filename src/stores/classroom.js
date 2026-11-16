import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { classrooms, classroomFilters } from '@/mock/seed'
import { recommendClassrooms, roomFreeSlots, sleep } from '@/utils/aiEngine'
import { uid } from '@/utils/format'
import { loadState } from '@/utils/storage'
import { bindSharedState } from '@/utils/cloudSync'
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
      timeline: [
        { title: '提交申请', desc: 'AI 已完成资源核验并提交', time: dayjs().subtract(2, 'hour').toISOString() },
        { title: 'AI 资源核验通过', desc: '容量、设备、时段均满足要求', time: dayjs().subtract(2, 'hour').add(2, 'minute').toISOString() },
        { title: '管理员审核通过', desc: '请按时使用，使用后请关闭电源与门窗', time: dayjs().subtract(1, 'hour').toISOString() },
      ],
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
      timeline: [
        { title: '提交申请', desc: 'AI 已完成资源核验并提交', time: dayjs().subtract(40, 'minute').toISOString() },
        { title: 'AI 资源核验通过', desc: '容量、设备、时段均满足要求', time: dayjs().subtract(39, 'minute').toISOString() },
        { title: '等待管理员审核', desc: '预计 2 小时内完成', time: null, pending: true },
      ],
    },
  ]
}

export const useClassroomStore = defineStore('classroom', () => {
  const rooms = ref(classrooms)
  const storedApplications = loadState(V, seedApplications())
  const applications = ref(
    Array.isArray(storedApplications) && storedApplications.every((item) => classrooms.some((room) => room.id === item.roomId))
      ? storedApplications
      : seedApplications(),
  )
  const criteria = ref({
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
  const lastCriteria = ref(null)
  const recommendations = ref([])
  const loading = ref(false)
  let seq = 0

  const filters = computed(() => classroomFilters)

  const pendingApplications = computed(() => applications.value.filter((a) => a.status === 'pending'))
  const approvedApplications = computed(() => applications.value.filter((a) => a.status === 'approved'))
  const stats = computed(() => ({
    total: applications.value.length,
    pending: pendingApplications.value.length,
    approved: approvedApplications.value.length,
    rooms: rooms.value.length,
  }))

  function getRoom(id) {
    return rooms.value.find((r) => r.id === id) || null
  }

  function getApplication(id) {
    return applications.value.find((a) => a.id === id) || null
  }

  function freeSlotsOf(room, day) {
    return roomFreeSlots(room, day || 3)
  }

  function setCriteria(patch) {
    criteria.value = { ...criteria.value, ...patch }
  }

  async function recommend(input) {
    const merged = { ...criteria.value, ...(input || {}) }
    if (merged.campus === '全部校区') merged.campus = ''
    if (merged.building === '全部楼栋') merged.building = ''
    criteria.value = merged
    lastCriteria.value = JSON.parse(JSON.stringify(merged))
    loading.value = true
    const job = ++seq
    await sleep(900)
    if (job !== seq) return recommendations.value
    recommendations.value = recommendClassrooms(rooms.value, merged)
    loading.value = false
    return recommendations.value
  }

  function apply(payload) {
    const room = getRoom(payload.roomId)
    if (!room) return null
    const user = useUserStore()
    const notify = useNotifyStore()
    const application = {
      id: uid('ap'),
      roomId: room.id,
      roomCode: room.code,
      building: room.building,
      campus: room.campus,
      date: payload.date,
      day: Number(payload.day) || 3,
      start: payload.start,
      end: payload.end,
      purpose: payload.purpose,
      people: Number(payload.people) || 0,
      applicant: user.user?.name || payload.applicant || '林小满',
      applicantId: user.user?.id || '',
      contact: payload.contact || '站内联系',
      note: payload.note || '',
      status: 'pending',
      aiReason:
        payload.aiReason ||
        `容量 ${room.capacity} 人，配备${room.equipment.join('、')}，${payload.date} ${payload.start}–${payload.end} 空闲。`,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      timeline: [
        { title: '提交申请', desc: 'AI 已完成资源核验并提交', time: new Date().toISOString() },
        {
          title: 'AI 资源核验通过',
          desc: `容量 ${room.capacity} 人 · ${room.equipment.join(' / ')} · 时段空闲`,
          time: new Date().toISOString(),
        },
        { title: '等待管理员审核', desc: '预计 2 小时内完成', time: null, pending: true },
      ],
    }
    applications.value.unshift(application)
    notify.add({
      type: 'status',
      title: '教室申请已提交',
      content: `${room.building} ${room.code} · ${payload.date} ${payload.start}–${payload.end} 已提交审核，结果将在这里通知你。`,
      link: `/classroom/status/${application.id}`,
      sourceType: 'classroom',
      sourceId: application.id,
    })
    return application
  }

  function approve(id) {
    const app = getApplication(id)
    if (!app || app.status !== 'pending') return
    app.status = 'approved'
    app.reviewedAt = new Date().toISOString()
    app.timeline = app.timeline.filter((t) => !t.pending)
    app.timeline.push({
      title: '管理员审核通过',
      desc: '请按时使用，使用后请关闭电源与门窗',
      time: app.reviewedAt,
    })
    useNotifyStore().add({
      type: 'status',
      title: '教室申请已通过',
      content: `${app.building} ${app.roomCode} · ${app.date} ${app.start}–${app.end} 已通过审核。`,
      link: `/classroom/status/${app.id}`,
      recipientUserId: app.applicantId || '',
      recipientName: app.applicant,
      sourceType: 'classroom',
      sourceId: app.id,
    })
  }

  function reject(id, reason = '该时段已被其他活动占用') {
    const app = getApplication(id)
    if (!app || app.status !== 'pending') return
    app.status = 'rejected'
    app.reviewedAt = new Date().toISOString()
    app.timeline = app.timeline.filter((t) => !t.pending)
    app.timeline.push({ title: '管理员驳回', desc: reason, time: app.reviewedAt })
    useNotifyStore().add({
      type: 'status',
      title: '教室申请未通过',
      content: `${app.building} ${app.roomCode} · ${app.date} ${app.start}–${app.end}：${reason}`,
      link: `/classroom/status/${app.id}`,
      recipientUserId: app.applicantId || '',
      recipientName: app.applicant,
      sourceType: 'classroom',
      sourceId: app.id,
    })
  }

  function cancel(id) {
    const app = getApplication(id)
    if (!app || app.status === 'cancelled') return
    app.status = 'cancelled'
    app.timeline.push({ title: '申请人取消', desc: '该申请已由申请人取消', time: new Date().toISOString() })
  }

  bindSharedState(V, applications, '教室申请', { permission: 'classroom.apply' })

  return {
    rooms,
    applications,
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
    setCriteria,
    recommend,
    apply,
    approve,
    reject,
    cancel,
  }
})
