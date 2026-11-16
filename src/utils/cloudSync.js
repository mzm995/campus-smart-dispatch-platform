import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { apiRequest, getAuthToken } from './api'
import { loadIndexedState, loadState, removeState, saveState } from './storage'
import { useUserStore } from '@/stores/user'

const RESOURCES = {
  'v1:classroomApplications': 'classroom',
  'v2:lostfoundPosts': 'lostfound',
  'v3:groupBuys': 'groupbuy',
  'v5:forumPosts': 'forum',
  'v2:dispatch': 'dispatch',
}

const RETRY_KEY = 'cloud:retryQueue'
const CONFLICT_KEY = 'cloud:conflicts'
const bindings = new Map()
const conflictPayloads = new Map()
let globalsBound = false
let pollTimer = null
let retryTimer = null
let syncSuspended = false
const warnedResources = new Set()

const cloudStatus = reactive([])
export const cloudConflicts = reactive([
  ...(loadState(CONFLICT_KEY, []) || []),
])

function clone(value) {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function resourceBinding(resource) {
  return bindings.get(resource) || null
}

function canAccessBinding(binding) {
  if (!binding?.permission) return true
  return useUserStore().canAccess(binding.permission)
}

function saveConflictMetadata() {
  saveState(CONFLICT_KEY, [...cloudConflicts])
}

function loadRetryQueue() {
  const stored = loadState(RETRY_KEY, [])
  return Array.isArray(stored) ? stored : []
}

function saveRetryQueue(queue) {
  saveState(RETRY_KEY, [...new Set(queue)])
}

function enqueueRetry(resource) {
  const queue = loadRetryQueue()
  if (!queue.includes(resource)) {
    queue.push(resource)
    saveRetryQueue(queue)
  }
}

function removeRetry(resource) {
  saveRetryQueue(loadRetryQueue().filter((item) => item !== resource))
}

function isRetryPending(resource) {
  return loadRetryQueue().includes(resource)
}

function applyRemote(binding, document, { preserveDirty = false } = {}) {
  binding.applyingRemote = true
  binding.state.value = clone(document.data)
  binding.remoteState = clone(document.data)
  saveState(binding.localKey, document.data)
  binding.version = Number(document.version)
  binding.hydrated = true
  binding.dirty = preserveDirty
  window.setTimeout(() => {
    binding.applyingRemote = false
  }, 0)
}

async function fetchDocument(resource) {
  const data = await apiRequest(`/shared/${resource}`)
  return data.document
}

function registerConflict(binding, remoteDocument) {
  if (!remoteDocument) return
  binding.timer && window.clearTimeout(binding.timer)
  binding.timer = null
  binding.conflict = true
  binding.error = ''
  const detectedAt = new Date().toISOString()
  const backupKey = `cloud:conflictBackup:${binding.resource}:${Date.now()}`
  const localSnapshot = clone(binding.state.value)
  saveState(backupKey, localSnapshot)
  const existingIndex = cloudConflicts.findIndex(
    (item) => item.resource === binding.resource,
  )
  const conflict = {
    resource: binding.resource,
    label: binding.label,
    detectedAt,
    baseVersion: Number(remoteDocument.version),
    backupKey,
  }
  if (existingIndex >= 0) cloudConflicts.splice(existingIndex, 1, conflict)
  else cloudConflicts.push(conflict)
  conflictPayloads.set(binding.resource, {
    local: localSnapshot,
    remote: clone(remoteDocument.data),
    remoteVersion: Number(remoteDocument.version),
  })
  saveConflictMetadata()
}

async function pullResource(resource, { force = false } = {}) {
  if (syncSuspended) return
  const binding = resourceBinding(resource)
  if (!binding || !getAuthToken() || !canAccessBinding(binding)) return
  try {
    const document = await fetchDocument(resource)
    if (!document) {
      if (!binding.hydrated) await pushResource(resource)
      return
    }
    const remoteVersion = Number(document.version)
    const hasLocalChanges =
      binding.dirty ||
      Boolean(binding.timer) ||
      binding.pushing ||
      isRetryPending(resource)
    if (
      (force || remoteVersion > binding.version) &&
      hasLocalChanges &&
      binding.version > 0
    ) {
      registerConflict(binding, document)
      return
    }
    if (force || remoteVersion > binding.version) {
      applyRemote(binding, document)
    }
    binding.hydrated = true
    binding.error = ''
  } catch (error) {
    if (error?.status === 401) return
    binding.error = error?.message || '云端同步失败'
    enqueueRetry(resource)
    if (!warnedResources.has(resource)) {
      warnedResources.add(resource)
      ElMessage.warning(`${binding.label}云端同步暂时不可用：${binding.error}`)
    }
  }
}

function buildChanges(binding, snapshot) {
  const before = Array.isArray(binding.remoteState) ? binding.remoteState : []
  const after = Array.isArray(snapshot) ? snapshot : []
  const beforeById = new Map(before.filter((item) => item?.id).map((item) => [item.id, item]))
  const afterIds = new Set(after.filter((item) => item?.id).map((item) => item.id))
  const upserts = after.filter((item) => {
    if (!item?.id) return false
    const previous = beforeById.get(item.id)
    return !previous || JSON.stringify(previous) !== JSON.stringify(item)
  })
  const deletes = [...beforeById.keys()].filter((id) => !afterIds.has(id))
  return {
    upserts,
    deletes,
    order: after.filter((item) => item?.id).map((item) => item.id),
  }
}

function mergeIdList(resource, localList, remoteList, keyFields) {
  const output = []
  const seen = new Set()
  const keyOf = (item) =>
    item?.id ||
    keyFields.map((field) => item?.[field]).filter(Boolean).join(':') ||
    JSON.stringify(item)
  for (const item of [...(localList || []), ...(remoteList || [])]) {
    const key = keyOf(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

function mergeRecord(resource, local, remote) {
  const merged = { ...remote, ...local }
  merged.ownerId = remote.ownerId || local.ownerId
  merged.authorId = remote.authorId || local.authorId
  if (resource === 'forum') {
    merged.replies = mergeIdList(
      resource,
      local.replies,
      remote.replies,
      ['author', 'createdAt', 'content'],
    )
    merged.likes = Math.max(Number(local.likes) || 0, Number(remote.likes) || 0)
    merged.solved = Boolean(local.solved || remote.solved)
    merged.views = Math.max(Number(local.views) || 0, Number(remote.views) || 0)
  }
  if (resource === 'lostfound') {
    merged.claims = mergeIdList(
      resource,
      local.claims,
      remote.claims,
      ['kind', 'helperId', 'createdAt'],
    )
    if (local.status === 'resolved' || remote.status === 'resolved') merged.status = 'resolved'
  }
  if (resource === 'groupbuy') {
    merged.participants = mergeIdList(
      resource,
      local.participants,
      remote.participants,
      ['userId', 'name'],
    )
    const rank = { none: 0, open: 1, accepted: 2, delivered: 3, settled: 4, cancelled: 5 }
    const localErrand = local.errand || {}
    const remoteErrand = remote.errand || {}
    merged.errand =
      (rank[localErrand.status] || 0) >= (rank[remoteErrand.status] || 0)
        ? { ...remoteErrand, ...localErrand }
        : { ...localErrand, ...remoteErrand }
  }
  if (resource === 'classroom') {
    merged.timeline = mergeIdList(
      resource,
      local.timeline,
      remote.timeline,
      ['title', 'time'],
    )
    if (remote.status === 'approved' && local.status === 'pending') merged.status = 'approved'
  }
  return merged
}

function mergeSharedData(resource, localData, remoteData) {
  if (!Array.isArray(localData) || !Array.isArray(remoteData)) {
    return clone(localData ?? remoteData)
  }
  const localMap = new Map(localData.filter((item) => item?.id).map((item) => [item.id, item]))
  const remoteMap = new Map(remoteData.filter((item) => item?.id).map((item) => [item.id, item]))
  const ids = [...localMap.keys(), ...remoteMap.keys()]
  const output = []
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const local = localMap.get(id)
    const remote = remoteMap.get(id)
    if (local && remote) output.push(mergeRecord(resource, local, remote))
    else output.push(clone(local || remote))
  }
  return output
}

async function pushResource(resource, { keepalive = false } = {}) {
  if (syncSuspended) return
  const binding = resourceBinding(resource)
  if (
    !binding ||
    !getAuthToken() ||
    !canAccessBinding(binding) ||
    binding.applyingRemote ||
    binding.pushing ||
    binding.conflict
  ) return
  binding.pushing = true
  try {
    const snapshot = clone(binding.state.value)
    const changes = buildChanges(binding, snapshot)
    if (!changes.upserts.length && !changes.deletes.length) {
      binding.dirty = false
      removeRetry(resource)
      return
    }
    const result = await apiRequest(`/shared/${resource}/changes`, {
      method: 'PUT',
      body: { ...changes, baseVersion: binding.version },
      timeoutMs: keepalive ? 2500 : 10_000,
      keepalive,
    })
    binding.version = Number(result.version)
    binding.remoteState = clone(result.data ?? snapshot)
    binding.dirty = false
    binding.hydrated = true
    binding.error = ''
    removeRetry(resource)
    if (result.data && JSON.stringify(result.data) !== JSON.stringify(snapshot)) {
      applyRemote(
        binding,
        { data: result.data, version: result.version },
        { preserveDirty: false },
      )
    }
  } catch (error) {
    if (error?.code === 'SHARED_VERSION_CONFLICT') {
      const remote = await fetchDocument(resource).catch(() => null)
      registerConflict(binding, remote)
    } else if (error?.status === 401) {
      return
    } else if ([0, 500, 502, 503, 504].includes(Number(error?.status))) {
      binding.error = error?.message || '云端保存失败'
      binding.dirty = true
      enqueueRetry(resource)
      if (!warnedResources.has(resource)) {
        warnedResources.add(resource)
        ElMessage.warning(`${binding.label}保存失败，已加入自动重试队列`)
      }
    } else {
      binding.error = error?.message || '云端保存失败'
      if (error?.code === 'SHARED_DOCUMENT_TOO_LARGE') {
        ElMessage.error(`${binding.label}数据过大，图片请使用独立上传功能`)
      } else if (!warnedResources.has(resource)) {
        warnedResources.add(resource)
        ElMessage.warning(`${binding.label}云端保存失败：${binding.error}`)
      }
    }
  } finally {
    binding.pushing = false
  }
}

async function retryFailedResources() {
  if (!getAuthToken() || !navigator.onLine) return
  for (const resource of loadRetryQueue()) {
    const binding = resourceBinding(resource)
    if (binding && !binding.conflict) await pushResource(resource)
  }
}

async function flushAll({ keepalive = false } = {}) {
  if (syncSuspended) return
  for (const binding of bindings.values()) {
    window.clearTimeout(binding.localTimer)
    saveState(binding.localKey, binding.state.value)
  }
  await Promise.all(
    [...bindings.values()]
      .filter((binding) => binding.dirty && !binding.conflict && canAccessBinding(binding))
      .map((binding) => pushResource(binding.resource, { keepalive })),
  )
}

async function hydrateAll() {
  if (syncSuspended) return
  if (!getAuthToken()) return
  await Promise.all(
    [...bindings.values()]
      .filter(canAccessBinding)
      .map((binding) => pullResource(binding.resource)),
  )
}

async function pollMetadata() {
  if (syncSuspended) return
  if (!getAuthToken()) return
  try {
    const data = await apiRequest('/shared/meta')
    const remote = new Map(
      (data.documents || []).map((item) => [item.resource, Number(item.version)]),
    )
    await Promise.all(
      [...bindings.entries()]
        .filter(([resource, binding]) => remote.get(resource) > binding.version)
        .map(([resource]) => pullResource(resource)),
    )
  } catch {
    // 保留本地副本，在线恢复后继续重试。
  }
}

function bindGlobals() {
  if (globalsBound) return
  globalsBound = true
  window.addEventListener('campus-smart-dispatch-platform:session-ready', hydrateAll)
  window.addEventListener('campus-smart-dispatch-platform:session-clear', () => {
    for (const binding of bindings.values()) {
      binding.version = 0
      binding.remoteState = []
      binding.hydrated = false
      binding.dirty = false
      binding.conflict = false
      binding.error = ''
      binding.state.value = []
      removeState(binding.localKey)
    }
  })
  window.addEventListener('online', retryFailedResources)
  window.addEventListener('pagehide', () => flushAll({ keepalive: true }))
  window.addEventListener('beforeunload', () => {
    window.clearInterval(pollTimer)
    window.clearInterval(retryTimer)
    flushAll({ keepalive: true })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll({ keepalive: true })
  })
  pollTimer = window.setInterval(pollMetadata, 7000)
  retryTimer = window.setInterval(retryFailedResources, 5000)
}

export function bindSharedState(localKey, stateRef, label = '业务数据', options = {}) {
  const resource = RESOURCES[localKey]
  if (!resource || bindings.has(resource)) return
  const binding = {
    resource,
    localKey,
    label,
    state: stateRef,
    remoteState: [],
    version: 0,
    hydrated: false,
    applyingRemote: false,
    pushing: false,
    dirty: isRetryPending(resource),
    conflict: cloudConflicts.some((item) => item.resource === resource),
    error: '',
    timer: null,
    localTimer: null,
    permission: options.permission || '',
  }
  bindings.set(resource, binding)
  cloudStatus.push(binding)
  bindGlobals()

  watch(
    stateRef,
    (value) => {
      window.clearTimeout(binding.localTimer)
      binding.localTimer = window.setTimeout(() => saveState(localKey, value), 120)
      if (binding.applyingRemote || !getAuthToken()) return
      binding.dirty = true
      window.clearTimeout(binding.timer)
      binding.timer = window.setTimeout(() => {
        binding.timer = null
        pushResource(resource)
      }, 300)
    },
    { deep: true },
  )

  if (getAuthToken()) {
    window.setTimeout(() => pullResource(resource), 0)
  }
  loadIndexedState(localKey).then((cached) => {
    if (cached === undefined || binding.hydrated || binding.dirty) return
    binding.applyingRemote = true
    binding.state.value = cached
    window.setTimeout(() => {
      binding.applyingRemote = false
    }, 0)
  })
}

async function getConflictPayload(conflict) {
  const cached = conflictPayloads.get(conflict.resource)
  if (cached) return cached
  const local = loadState(conflict.backupKey, undefined)
  return {
    local:
      local === undefined
        ? await loadIndexedState(conflict.backupKey)
        : local,
    remote: null,
    remoteVersion: Number(conflict.baseVersion) || 0,
  }
}

export async function resolveCloudConflict(resource, action) {
  const conflictIndex = cloudConflicts.findIndex((item) => item.resource === resource)
  if (conflictIndex < 0) return
  const conflict = cloudConflicts[conflictIndex]
  const binding = resourceBinding(resource)
  const payload = await getConflictPayload(conflict)
  const localData = payload.local
  let remoteDocument = null
  try {
    remoteDocument = await fetchDocument(resource)
  } catch (error) {
    ElMessage.error(`读取云端版本失败：${error?.message || error}`)
    return
  }
  const remoteData = remoteDocument?.data ?? payload.remote ?? []
  if (action === 'cloud') {
    if (binding && remoteDocument) applyRemote(binding, remoteDocument)
  } else {
    const nextData =
      action === 'merge'
        ? mergeSharedData(resource, localData, remoteData)
        : clone(localData)
    if (binding) {
      binding.applyingRemote = true
      binding.state.value = nextData
      saveState(binding.localKey, nextData)
      binding.remoteState = clone(remoteData)
      binding.version = Number(remoteDocument?.version) || binding.version
      binding.conflict = false
      binding.dirty = true
      window.setTimeout(() => {
        binding.applyingRemote = false
        pushResource(resource)
      }, 0)
    } else {
      saveState(`conflictResolved:${resource}`, nextData)
    }
  }
  cloudConflicts.splice(conflictIndex, 1)
  conflictPayloads.delete(resource)
  removeState(conflict.backupKey)
  saveConflictMetadata()
  removeRetry(resource)
  if (binding) binding.error = ''
}

export async function recoverConflictBackup(resource) {
  const conflict = cloudConflicts.find((item) => item.resource === resource)
  if (!conflict) return null
  const payload = await getConflictPayload(conflict)
  saveState(`conflictRecovered:${resource}`, payload.local)
  ElMessage.success('本地冲突副本已恢复为独立备份')
  return payload.local
}

export { flushAll }

export function suspendCloudSync() {
  syncSuspended = true
  if (pollTimer) window.clearInterval(pollTimer)
  if (retryTimer) window.clearInterval(retryTimer)
  for (const binding of bindings.values()) {
    window.clearTimeout(binding.timer)
    window.clearTimeout(binding.localTimer)
    binding.timer = null
    binding.localTimer = null
  }
}

export const cloudSyncSummary = computed(() => {
  const accessible = cloudStatus.filter(canAccessBinding)
  return {
    total: accessible.length,
    synced: accessible.filter((item) => item.hydrated && !item.error && !item.conflict).length,
    failed: accessible.filter((item) => item.error || item.conflict).length,
    pending: accessible.filter((item) => item.dirty).length,
    conflicts: cloudConflicts.length,
  }
})
