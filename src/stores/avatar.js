import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiAssetUrl, apiRequest } from '@/utils/api'

function normalizeName(value) {
  return String(value || '').trim()
}

export const useAvatarDirectoryStore = defineStore('avatarDirectory', () => {
  const byName = ref({})
  const byId = ref({})
  const loading = ref(false)
  const loadedAt = ref(0)
  let refreshTimer = null

  function upsert(user) {
    if (!user) return
    const avatarUrl = String(user.avatarUrl || '')
    if (user.id) byId.value = { ...byId.value, [user.id]: avatarUrl }
    const name = normalizeName(user.name)
    if (name) byName.value = { ...byName.value, [name]: avatarUrl }
  }

  async function refresh() {
    if (loading.value) return
    loading.value = true
    try {
      const data = await apiRequest('/auth/demo-accounts', { auth: false })
      const nextByName = {}
      const nextById = {}
      for (const account of data.accounts || []) {
        const avatarUrl = String(account.avatarUrl || '')
        if (account.id) nextById[account.id] = avatarUrl
        const name = normalizeName(account.name)
        if (name) nextByName[name] = avatarUrl
      }
      byName.value = nextByName
      byId.value = nextById
      loadedAt.value = Date.now()
    } catch {
      // 目录刷新失败时保留上一次可用头像。
    } finally {
      loading.value = false
    }
  }

  function resolve(name, userId = '') {
    const avatarUrl =
      (userId && byId.value[userId]) ||
      byName.value[normalizeName(name)] ||
      ''
    return avatarUrl ? apiAssetUrl(avatarUrl) : ''
  }

  function start() {
    if (refreshTimer) return
    refresh()
    refreshTimer = window.setInterval(refresh, 15_000)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stop() {
    if (refreshTimer) window.clearInterval(refreshTimer)
    refreshTimer = null
    window.removeEventListener('online', refresh)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') refresh()
  }

  return {
    byName,
    byId,
    loading,
    loadedAt,
    upsert,
    refresh,
    resolve,
    start,
    stop,
  }
})
