import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { groupBuys } from '@/mock/seed'
import { apiRequest } from '@/utils/api'
import { countdown, uid } from '@/utils/format'
import { loadState, saveState } from '@/utils/storage'
import { useNotifyStore } from './notify'
import { useUserStore } from './user'

const V = 'v3:groupBuys'
const COMMERCE_STATUS_TEXT = {
  recruiting: '招募中',
  formed: '已成团',
  funded: '资金已托管',
  purchasing: '采购中',
  shipping: '配送中',
  ready: '到货待领取',
  completed: '已完成',
  expired: '已结束',
  cancelled: '已取消',
  disputed: '争议处理中',
  refunding: '退款中',
}

export const useGroupBuyStore = defineStore('groupbuy', () => {
  const cached = loadState(V, groupBuys)
  const items = ref(Array.isArray(cached) ? cached : groupBuys)
  const creating = ref(false)
  const loading = ref(false)
  const syncing = ref(false)
  const syncError = ref('')
  const keyword = ref('')
  const category = ref('全部')
  let pollTimer = null
  let hydrating = null

  function joinedCountOf(item) {
    return (item.participants || []).reduce(
      (sum, participant) => sum + (Number(participant.count) || 1),
      0,
    )
  }

  function commerceStatusOf(item) {
    return item?.commerce?.status || (joinedCountOf(item) >= item?.targetCount ? 'formed' : 'recruiting')
  }

  function statusOf(item) {
    const status = commerceStatusOf(item)
    if (status === 'recruiting') return 'ongoing'
    if (['completed', 'cancelled'].includes(status)) return 'expired'
    if (status === 'expired') return 'expired'
    return 'success'
  }

  function commerceTextOf(item) {
    return COMMERCE_STATUS_TEXT[commerceStatusOf(item)] || '进行中'
  }

  function progressOf(item) {
    return Math.min(100, Math.round((joinedCountOf(item) / Math.max(1, item.targetCount)) * 100))
  }

  function remainingOf(item) {
    return Math.max(0, item.targetCount - joinedCountOf(item))
  }

  function countdownOf(item) {
    return countdown(item.deadline)
  }

  function isJoined(item) {
    const user = useUserStore()
    return (item.participants || []).some(
      (participant) =>
        participant.userId === user.user?.id || participant.name === user.user?.name,
    )
  }

  function isOwner(item) {
    const user = useUserStore()
    if (!item) return false
    if (item.ownerId) return item.ownerId === user.user?.id
    return item.owner === user.user?.name
  }

  function errandOf(item) {
    return item?.errand?.enabled ? item.errand : null
  }

  function errandStatusOf(item) {
    return errandOf(item)?.status || ''
  }

  function isErrandRunner(item) {
    const user = useUserStore()
    return Boolean(errandOf(item)?.runnerId && errandOf(item).runnerId === user.user?.id)
  }

  function canAcceptErrand(item) {
    const errand = errandOf(item)
    return Boolean(
      errand &&
        errand.status === 'open' &&
        !isOwner(item) &&
        new Date(item.deadline).getTime() > Date.now(),
    )
  }

  function getById(id) {
    return items.value.find((item) => item.id === id) || null
  }

  function updateItem(item) {
    if (!item?.id) return
    const index = items.value.findIndex((entry) => entry.id === item.id)
    if (index >= 0) items.value.splice(index, 1, item)
    else items.value.unshift(item)
    saveState(V, items.value)
  }

  const ongoing = computed(() =>
    items.value
      .filter((item) => commerceStatusOf(item) === 'recruiting')
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
  )
  const finished = computed(() =>
    items.value.filter((item) => commerceStatusOf(item) !== 'recruiting'),
  )
  const mine = computed(() => {
    const user = useUserStore()
    return items.value.filter(
      (item) =>
        item.ownerId === user.user?.id ||
        item.owner === user.user?.name ||
        (item.participants || []).some(
          (participant) =>
            participant.userId === user.user?.id || participant.name === user.user?.name,
        ),
    )
  })

  const filtered = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return items.value.filter((item) => {
      if (category.value !== '全部' && item.category !== category.value) return false
      if (
        kw &&
        !`${item.title}${item.product}${item.pickup}${item.owner}`.toLowerCase().includes(kw)
      ) {
        return false
      }
      return true
    })
  })

  const stats = computed(() => ({
    ongoing: ongoing.value.length,
    total: items.value.length,
    joined: mine.value.length,
    saved: mine.value.reduce((sum, item) => sum + (item.unitPrice || 0) * 0.3, 0).toFixed(1),
    errands: items.value.filter((item) => errandOf(item)?.status === 'open').length,
  }))

  async function hydrate({ quiet = false } = {}) {
    if (!useUserStore().isLoggedIn) return items.value
    if (hydrating) return hydrating
    if (!quiet) loading.value = true
    hydrating = apiRequest('/groupbuy/orders')
      .then((data) => {
        if (Array.isArray(data.items)) items.value = data.items
        saveState(V, items.value)
        syncError.value = ''
        return items.value
      })
      .catch((error) => {
        syncError.value = error?.message || '拼单同步失败'
        if (!quiet) throw error
        return items.value
      })
      .finally(() => {
        loading.value = false
        hydrating = null
      })
    return hydrating
  }

  async function create(form) {
    creating.value = true
    try {
      const data = await apiRequest('/groupbuy/orders', {
        method: 'POST',
        body: {
          ...form,
          idempotencyKey: `group-create:${uid('request')}`,
        },
        timeoutMs: 15_000,
      })
      updateItem(data.item)
      useNotifyStore().add({
        type: 'deadline',
        title: '拼单已发布',
        content: `「${data.item.title}」已发布，目标 ${data.item.targetCount} 份，截止 ${countdown(data.item.deadline).label}。`,
        link: `/groupbuy/${data.item.id}`,
        sourceType: 'groupbuy',
        sourceId: data.item.id,
      })
      return data.item
    } finally {
      creating.value = false
    }
  }

  async function action(itemOrId, actionName, payload = {}) {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id
    if (!id) throw new Error('拼单不存在')
    syncing.value = true
    try {
      const data = await apiRequest(`/groupbuy/${encodeURIComponent(id)}/actions`, {
        method: 'POST',
        body: {
          action: actionName,
          ...payload,
          idempotencyKey: `group:${actionName}:${uid('request')}`,
        },
        timeoutMs: 15_000,
      })
      if (data.removed) {
        items.value = items.value.filter((item) => item.id !== id)
        saveState(V, items.value)
      } else {
        updateItem(data.item)
      }
      syncError.value = ''
      return data
    } catch (error) {
      syncError.value = error?.message || '拼单操作失败'
      throw error
    } finally {
      syncing.value = false
    }
  }

  async function join(id, count = 1) {
    return action(id, 'join', { quantity: count })
  }

  async function leave(id, quantity) {
    return action(id, 'leave', { quantity })
  }

  async function purchase(id, receipt = '') {
    return action(id, 'purchase', { receipt })
  }

  async function ship(id) {
    return action(id, 'ship')
  }

  async function markReady(id, proof = '') {
    return action(id, 'ready', { proof })
  }

  async function redeemPickup(id, userId, code) {
    return action(id, 'redeem', { userId, code })
  }

  async function confirmReceived(id, code) {
    return action(id, 'confirm_received', { code })
  }

  async function openDispute(id, reason) {
    return action(id, 'dispute', { reason })
  }

  async function resolveDispute(id, accepted, resolution) {
    return action(id, 'resolve_dispute', { accepted, resolution })
  }

  async function cancelOrder(id, reason = '发起人取消拼单') {
    return action(id, 'cancel', { reason })
  }

  async function remove(id) {
    return action(id, 'remove')
  }

  async function acceptErrand(id) {
    return action(id, 'accept_errand')
  }

  async function completeErrand(id) {
    return action(id, 'complete_errand')
  }

  async function confirmErrand(id) {
    return action(id, 'confirm_errand')
  }

  async function cancelErrandByOwner(id, reason = '发起人取消跑腿任务') {
    return action(id, 'cancel_errand', { reason })
  }

  async function withdrawErrand(id, reason = '接单人暂时无法继续') {
    return action(id, 'withdraw_errand', { reason })
  }

  function stopPolling() {
    if (pollTimer) window.clearInterval(pollTimer)
    pollTimer = null
  }

  function startPolling() {
    stopPolling()
    if (!useUserStore().isLoggedIn) return
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') hydrate({ quiet: true })
    }, 8000)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('campus-smart-dispatch-platform:session-ready', () => {
      hydrate().catch(() => {})
      startPolling()
    })
    window.addEventListener('campus-smart-dispatch-platform:session-clear', () => {
      stopPolling()
      items.value = []
      saveState(V, [])
    })
    window.addEventListener('focus', () => hydrate({ quiet: true }))
    window.setTimeout(() => {
      if (useUserStore().isLoggedIn) {
        hydrate().catch(() => {})
        startPolling()
      }
    }, 0)
  }

  return {
    items,
    creating,
    loading,
    syncing,
    syncError,
    keyword,
    category,
    ongoing,
    finished,
    mine,
    filtered,
    stats,
    joinedCountOf,
    commerceStatusOf,
    commerceTextOf,
    statusOf,
    progressOf,
    remainingOf,
    countdownOf,
    isJoined,
    isOwner,
    errandOf,
    errandStatusOf,
    isErrandRunner,
    canAcceptErrand,
    getById,
    hydrate,
    create,
    join,
    leave,
    purchase,
    ship,
    markReady,
    redeemPickup,
    confirmReceived,
    openDispute,
    resolveDispute,
    cancelOrder,
    remove,
    acceptErrand,
    completeErrand,
    confirmErrand,
    cancelErrandByOwner,
    withdrawErrand,
  }
})
