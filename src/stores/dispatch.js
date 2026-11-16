import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { loadState } from '@/utils/storage'
import { bindSharedState } from '@/utils/cloudSync'
import { dispatchRecords } from '@/mock/seed'
import { uid } from '@/utils/format'
import { useUserStore } from './user'

const V = 'v2:dispatch'

export const useDispatchStore = defineStore('dispatch', () => {
  const currentUser = useUserStore()
  const initialRecords = () => dispatchRecords.map((record) => ({
    ...record,
    actorId: currentUser.user?.id || '',
    ownerId: currentUser.user?.id || '',
    userName: currentUser.user?.name || '',
  }))
  const records = ref(loadState(V, initialRecords()))
  const latest = computed(() => records.value[0] || null)
  const recent = computed(() => records.value.slice(0, 5))

  function add(record) {
    const user = currentUser
    records.value.unshift({
      id: uid('dp'),
      createdAt: new Date().toISOString(),
      status: '已分发',
      actorId: user.user?.id || '',
      ownerId: user.user?.id || '',
      userName: user.user?.name || '',
      ...record,
    })
    if (records.value.length > 40) records.value = records.value.slice(0, 40)
  }

  function clear() {
    records.value = []
  }

  bindSharedState(V, records, '调度日志')

  return { records, latest, recent, add, clear }
})
