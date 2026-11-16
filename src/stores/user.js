import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { loadState, removeState, saveState } from '@/utils/storage'
import {
  apiAssetUrl,
  apiRequest,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '@/utils/api'
import { maskStudentNo } from '@/utils/format'

const USER_CACHE = 'v2:user'
const USER_DATA_CACHES = [
  'v1:classroomApplications',
  'v2:lostfoundPosts',
  'v3:groupBuys',
  'v5:forumPosts',
  'v2:notifications',
  'v2:dispatch',
]

export const useUserStore = defineStore('user', () => {
  const user = ref(loadState(USER_CACHE, null))
  const token = ref(getAuthToken())
  const authReady = ref(false)
  const restoring = ref(false)
  const backendUnavailable = ref(false)
  const backendError = ref('')
  let verifiedAt = 0

  const isLoggedIn = computed(() => Boolean(user.value && token.value))
  const isAdmin = computed(() => Number(user.value?.roleLevel || 0) >= 80)
  const isSuperAdmin = computed(() => user.value?.roleKey === 'super_admin')
  const canManageUsers = computed(() => isSuperAdmin.value)
  const permissions = computed(() => user.value?.permissions || null)
  const canViewOtherUsers = computed(() => Boolean(permissions.value?.canViewOtherUsers))
  const maskedNo = computed(() =>
    user.value ? maskStudentNo(user.value.studentNo) : '',
  )
  const avatarUrl = computed(() =>
    user.value?.avatarUrl ? apiAssetUrl(user.value.avatarUrl) : '',
  )

  function applySession(data) {
    user.value = data.user
    token.value = data.token || token.value
    if (data.token) setAuthToken(data.token)
    saveState(USER_CACHE, user.value)
    verifiedAt = Date.now()
    authReady.value = true
    backendUnavailable.value = false
    backendError.value = ''
    window.dispatchEvent(new Event('campus-smart-dispatch-platform:session-ready'))
  }

  function can(permission) {
    return Boolean(permission && permissions.value?.actions?.[permission])
  }

  function canAccess(moduleKey) {
    return Boolean(moduleKey && permissions.value?.modules?.[moduleKey])
  }

  function clearSession() {
    user.value = null
    token.value = ''
    verifiedAt = 0
    authReady.value = true
    clearAuthToken()
    saveState(USER_CACHE, null)
    backendUnavailable.value = false
    backendError.value = ''
    window.dispatchEvent(new Event('campus-smart-dispatch-platform:session-clear'))
    USER_DATA_CACHES.forEach(removeState)
  }

  async function login({ studentNo, name, password }) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        studentNo: String(studentNo).trim(),
        name: String(name).trim(),
        password,
      },
    })
    applySession(data)
    return user.value
  }

  async function loginDemo(account, password = '123456') {
    return login({ studentNo: account.studentNo, name: account.name, password })
  }

  async function createPerson(name, password, registrationCode = '') {
    return apiRequest('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        name: String(name).trim(),
        password,
        registrationCode: String(registrationCode || '').trim(),
      },
    })
  }

  async function logout() {
    try {
      if (token.value) {
        await apiRequest('/auth/logout', {
          method: 'POST',
          auth: true,
          timeoutMs: 4000,
        })
      }
    } catch {
      // 即使后端暂时不可用，也要清理本地会话并离开受保护页面。
    } finally {
      clearSession()
    }
  }

  async function restoreSession({ force = false } = {}) {
    if (restoring.value) return Boolean(user.value)
    if (!token.value) {
      authReady.value = true
      return false
    }
    if (!force && authReady.value && Date.now() - verifiedAt < 30_000) {
      return Boolean(user.value)
    }

    restoring.value = true
    try {
      const data = await apiRequest('/auth/me')
      user.value = data.user
      saveState(USER_CACHE, user.value)
      verifiedAt = Date.now()
      authReady.value = true
      backendUnavailable.value = false
      backendError.value = ''
      return true
    } catch (error) {
      if (error?.status === 401) {
        clearSession()
        return false
      }
      // 网络错误或服务端 5xx 时保留 token、用户资料和业务缓存，
      // 页面以本地快照继续可用，等待后端恢复后重试。
      backendUnavailable.value = true
      backendError.value = error?.message || '后端服务暂时不可用'
      authReady.value = true
      window.dispatchEvent(
        new CustomEvent('campus-smart-dispatch-platform:backend-unavailable', {
          detail: { message: backendError.value },
        }),
      )
      return Boolean(user.value && token.value)
    } finally {
      restoring.value = false
    }
  }

  async function retrySession() {
    return restoreSession({ force: true })
  }

  async function updateProfile(patch) {
    const data = await apiRequest('/me', {
      method: 'PATCH',
      body: patch,
    })
    user.value = data.user
    saveState(USER_CACHE, user.value)
    return user.value
  }

  async function changePassword({ currentPassword, newPassword }) {
    const data = await apiRequest('/me/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    })
    user.value = data.user
    saveState(USER_CACHE, user.value)
    return user.value
  }

  watch(user, (value) => saveState(USER_CACHE, value), { deep: true })

  return {
    user,
    token,
    authReady,
    restoring,
    backendUnavailable,
    backendError,
    isLoggedIn,
    isAdmin,
    isSuperAdmin,
    canManageUsers,
    permissions,
    canViewOtherUsers,
    maskedNo,
    avatarUrl,
    can,
    canAccess,
    login,
    loginDemo,
    createPerson,
    logout,
    restoreSession,
    retrySession,
    updateProfile,
    changePassword,
  }
})
