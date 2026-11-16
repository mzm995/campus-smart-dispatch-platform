import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiRequest } from '@/utils/api'
import { uid } from '@/utils/format'
import { useUserStore } from './user'

export const useNotifyStore = defineStore('notify', () => {
  const items = ref([])
  const loading = ref(false)
  const error = ref('')
  const scope = ref('own')
  let requestSeq = 0

  const user = useUserStore()
  const unreadCount = computed(() => items.value.filter((item) => !item.read).length)
  const importantUnread = computed(
    () => items.value.filter((item) => !item.read && item.important).length,
  )
  const total = computed(() => items.value.length)
  const unread = computed(() => items.value.filter((item) => !item.read))
  const canSwitchScope = computed(() => user.canViewOtherUsers)
  const isAllScope = computed(() => scope.value === 'all')

  function isOwnItem(item) {
    if (!item) return false
    if (item.ownerId) return item.ownerId === user.user?.id
    return item.ownerName === user.user?.name
  }

  function applyItems(nextItems) {
    items.value = Array.isArray(nextItems) ? nextItems : []
  }

  async function refresh({ nextScope = scope.value, silent = false } = {}) {
    if (!user.isLoggedIn) return []
    const seq = ++requestSeq
    loading.value = true
    if (!silent) error.value = ''
    try {
      const data = await apiRequest(
        `/notifications?scope=${encodeURIComponent(nextScope)}&limit=200`,
      )
      if (seq !== requestSeq) return items.value
      scope.value = data.scope === 'all' ? 'all' : 'own'
      applyItems(data.items)
      error.value = ''
      return items.value
    } catch (requestError) {
      if (seq === requestSeq) {
        error.value = requestError?.message || '通知加载失败'
        if (!silent) ElMessage.error(error.value)
      }
      return items.value
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  async function setScope(nextScope) {
    if (nextScope === 'all' && !canSwitchScope.value) {
      ElMessage.warning('当前角色不能查看其他用户的通知')
      return false
    }
    await refresh({ nextScope: nextScope === 'all' ? 'all' : 'own' })
    return !error.value
  }

  function add(payload) {
    const recipientUserId = payload.recipientUserId || user.user?.id || ''
    const recipientName =
      payload.recipientName ||
      (!payload.recipientUserId || recipientUserId === user.user?.id ? user.user?.name || '' : '')
    const own = recipientUserId
      ? recipientUserId === user.user?.id
      : recipientName === user.user?.name
    const item = {
      id: uid('nt'),
      ownerId: recipientUserId,
      ownerName: recipientName,
      actorId: user.user?.id || null,
      actorName: user.user?.name || '',
      type: 'system',
      title: '',
      content: '',
      link: '',
      read: false,
      important: false,
      time: new Date().toISOString(),
      ...payload,
    }
    delete item.recipientUserId
    delete item.recipientName
    if (own) items.value.unshift(item)

    apiRequest('/notifications', {
      method: 'POST',
      body: {
        recipientUserId: payload.recipientUserId || '',
        recipientName: payload.recipientName || '',
        type: item.type,
        title: item.title,
        content: item.content,
        link: item.link,
        important: item.important,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
      },
    })
      .then(({ notification }) => {
        if (!own || !notification) return
        const index = items.value.findIndex((entry) => entry.id === item.id)
        if (index >= 0) items.value[index] = notification
      })
      .catch((requestError) => {
        if (requestError?.status !== 401) {
          console.warn('[notify] failed to persist notification', requestError)
        }
      })
    return item
  }

  function updateLocal(id, patch) {
    const target = items.value.find((item) => item.id === id)
    if (!target) return null
    if (!isOwnItem(target)) {
      ElMessage.warning('管理视角只能查看其他用户的通知，不能修改')
      return null
    }
    Object.assign(target, patch)
    return target
  }

  function markRead(id) {
    const target = updateLocal(id, { read: true })
    if (!target) return
    apiRequest(`/notifications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { read: true },
    }).catch((requestError) => {
      target.read = false
      if (requestError?.status !== 401) ElMessage.error(requestError.message)
    })
  }

  function markUnread(id) {
    const target = updateLocal(id, { read: false })
    if (!target) return
    apiRequest(`/notifications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { read: false },
    }).catch((requestError) => {
      target.read = true
      if (requestError?.status !== 401) ElMessage.error(requestError.message)
    })
  }

  function markAllRead() {
    items.value.forEach((item) => {
      if (isOwnItem(item)) item.read = true
    })
    apiRequest('/notifications/read-all', { method: 'POST' }).catch((requestError) => {
      if (requestError?.status !== 401) ElMessage.error(requestError.message)
    })
  }

  function remove(id) {
    const target = items.value.find((item) => item.id === id)
    if (!target || !isOwnItem(target)) {
      ElMessage.warning('管理视角只能查看其他用户的通知，不能删除')
      return
    }
    items.value = items.value.filter((item) => item.id !== id)
    apiRequest(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      (requestError) => {
        if (requestError?.status !== 401) ElMessage.error(requestError.message)
        refresh({ silent: true })
      },
    )
  }

  function clearRead() {
    items.value = items.value.filter((item) => !item.read || !isOwnItem(item))
    apiRequest('/notifications/read', { method: 'DELETE' }).catch((requestError) => {
      if (requestError?.status !== 401) ElMessage.error(requestError.message)
      refresh({ silent: true })
    })
  }

  function reset() {
    requestSeq += 1
    items.value = []
    loading.value = false
    error.value = ''
    scope.value = 'own'
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('campus-smart-dispatch-platform:session-ready', () => refresh({ silent: true }))
    window.addEventListener('campus-smart-dispatch-platform:session-clear', reset)
    window.setTimeout(() => {
      if (user.isLoggedIn) refresh({ silent: true })
    }, 0)
  }

  return {
    items,
    loading,
    error,
    scope,
    unreadCount,
    importantUnread,
    total,
    unread,
    canSwitchScope,
    isAllScope,
    isOwnItem,
    refresh,
    setScope,
    add,
    markRead,
    markUnread,
    markAllRead,
    remove,
    clearRead,
  }
})
