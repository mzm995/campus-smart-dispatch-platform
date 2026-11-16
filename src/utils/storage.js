const PREFIX = 'campus-smart-dispatch-platform:'
const INDEXED_DB_NAME = 'campus-smart-dispatch-platform-cache'
const INDEXED_STORE = 'state'

function openIndexedDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(INDEXED_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(INDEXED_STORE)) {
        db.createObjectStore(INDEXED_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

async function putIndexedState(key, value) {
  const db = await openIndexedDb()
  if (!db) return false
  return new Promise((resolve) => {
    const transaction = db.transaction(INDEXED_STORE, 'readwrite')
    transaction.objectStore(INDEXED_STORE).put(value, key)
    transaction.oncomplete = () => {
      db.close()
      resolve(true)
    }
    transaction.onerror = () => {
      db.close()
      resolve(false)
    }
  })
}

export async function loadIndexedState(key) {
  const db = await openIndexedDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    const transaction = db.transaction(INDEXED_STORE, 'readonly')
    const request = transaction.objectStore(INDEXED_STORE).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
    transaction.oncomplete = () => db.close()
  })
}

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return typeof fallback === 'function' ? fallback() : fallback
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[campus-smart-dispatch-platform] 读取本地状态失败:', key, err)
    return typeof fallback === 'function' ? fallback() : fallback
  }
}

export function saveState(key, value) {
  try {
    const serialized = JSON.stringify(value)
    localStorage.setItem(PREFIX + key, serialized)
    return true
  } catch (err) {
    console.warn('[campus-smart-dispatch-platform] localStorage 写入失败，正在转存 IndexedDB:', key, err)
    putIndexedState(key, value).then((stored) => {
      window.dispatchEvent(
        new CustomEvent('campus-smart-dispatch-platform:storage-degraded', {
          detail: {
            key,
            indexedDb: stored,
            message: stored
              ? '本地存储空间不足，数据已转存到 IndexedDB，并在后端恢复后继续同步。'
              : '本地存储空间不足，且 IndexedDB 写入失败，请立即同步云端。',
          },
        }),
      )
    })
    return false
  }
}

export function removeState(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch (err) {
    console.warn('[campus-smart-dispatch-platform] 清理本地状态失败:', key, err)
  }
}

/** 清空全部演示数据（可用于"重置演示数据"） */
export function resetAll() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k))
}

export function clearBusinessState() {
  const preserved = new Set([
    `${PREFIX}v2:token`,
    `${PREFIX}v2:user`,
    `${PREFIX}v1:profilePrefs`,
  ])
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX) && !preserved.has(key))
    .forEach((key) => localStorage.removeItem(key))
}
