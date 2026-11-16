import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { groupBuys } from '@/mock/seed'
import { sleep } from '@/utils/aiEngine'
import { countdown, uid } from '@/utils/format'
import { loadState } from '@/utils/storage'
import { bindSharedState } from '@/utils/cloudSync'
import { useNotifyStore } from './notify'
import { useUserStore } from './user'

const V = 'v3:groupBuys'

export const useGroupBuyStore = defineStore('groupbuy', () => {
  const items = ref(loadState(V, groupBuys))
  const creating = ref(false)
  const keyword = ref('')
  const category = ref('全部')

  function joinedCountOf(item) {
    return (item.participants || []).reduce((sum, p) => sum + (Number(p.count) || 1), 0)
  }

  function statusOf(item) {
    if (joinedCountOf(item) >= item.targetCount) return 'success'
    if (item.deadline && new Date(item.deadline).getTime() < Date.now()) return 'expired'
    return 'ongoing'
  }

  function progressOf(item) {
    return Math.min(100, Math.round((joinedCountOf(item) / item.targetCount) * 100))
  }

  function remainingOf(item) {
    return Math.max(0, item.targetCount - joinedCountOf(item))
  }

  function countdownOf(item) {
    return countdown(item.deadline)
  }

  function isJoined(item) {
    const user = useUserStore()
    return (item.participants || []).some((p) => p.name === user.user?.name)
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
    return items.value.find((i) => i.id === id) || null
  }

  const ongoing = computed(() =>
    items.value.filter((i) => statusOf(i) === 'ongoing').sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
  )
  const finished = computed(() => items.value.filter((i) => statusOf(i) !== 'ongoing'))
  const mine = computed(() => {
    const user = useUserStore()
    return items.value.filter((i) => i.owner === user.user?.name || (i.participants || []).some((p) => p.name === user.user?.name))
  })

  const filtered = computed(() => {
    const kw = keyword.value.trim()
    return items.value.filter((i) => {
      if (category.value !== '全部' && i.category !== category.value) return false
      if (kw && !`${i.title}${i.product}${i.pickup}`.includes(kw)) return false
      return true
    })
  })

  const stats = computed(() => ({
    ongoing: ongoing.value.length,
    total: items.value.length,
    joined: mine.value.length,
    saved: mine.value.reduce((sum, i) => sum + (i.unitPrice || 0) * 0.3, 0).toFixed(1),
    errands: items.value.filter((item) => errandOf(item)?.status === 'open').length,
  }))

  async function create(form) {
    creating.value = true
    await sleep(650)
    const user = useUserStore()
    const notify = useNotifyStore()
    const item = {
      id: uid('gb'),
      title: form.title,
      product: form.product,
      category: form.category || '其他',
      unitPrice: Number(form.unitPrice) || 0,
      targetCount: Number(form.targetCount) || 2,
      participants: [{
        name: user.user?.name || '林小满',
        userId: user.user?.id || '',
        count: Number(form.myCount) || 1,
      }],
      deadline: form.deadline,
      pickup: form.pickup,
      owner: user.user?.name || '林小满',
      ownerId: user.user?.id || '',
      note: form.note || '',
      tone: form.tone || 'brand',
      createdAt: new Date().toISOString(),
      notice: form.notice || '',
      errand: form.errandEnabled
        ? {
            enabled: true,
            tip: Math.max(0.01, Number(form.errandTip) || 0),
            description: String(form.errandDescription || '').trim(),
            status: 'open',
            runnerId: '',
            runnerName: '',
            acceptedAt: null,
            completedAt: null,
            confirmedAt: null,
            cancelledAt: null,
            cancelReason: '',
          }
        : {
            enabled: false,
            tip: 0,
            description: '',
            status: 'none',
          },
    }
    items.value.unshift(item)
    creating.value = false
    notify.add({
      type: 'deadline',
      title: '拼单已发布',
      content: `「${item.title}」已发布，目标 ${item.targetCount} 份，截止 ${countdown(item.deadline).label}。`,
      link: `/groupbuy/${item.id}`,
      sourceType: 'groupbuy',
      sourceId: item.id,
    })
    return item
  }

  function acceptErrand(id) {
    const item = getById(id)
    const user = useUserStore()
    const errand = errandOf(item)
    if (!item || !errand) return { ok: false, message: '该拼单没有跑腿任务' }
    if (isOwner(item)) return { ok: false, message: '发起人不能接取自己的跑腿任务' }
    if (new Date(item.deadline).getTime() <= Date.now()) {
      return { ok: false, message: '拼单已截止，无法接取跑腿' }
    }
    if (errand.status !== 'open') {
      return {
        ok: false,
        message: errand.status === 'accepted' ? '该跑腿已被其他同学接取' : '该跑腿当前不可接取',
      }
    }
    errand.status = 'accepted'
    errand.runnerId = user.user?.id || ''
    errand.runnerName = user.user?.name || '匿名同学'
    errand.runnerContact = '站内联系'
    errand.acceptedAt = new Date().toISOString()
    useNotifyStore().add({
      type: 'status',
      title: '跑腿任务已被接取',
      content: `${errand.runnerName} 接取了「${item.title}」的跑腿任务，小费 ¥${Number(errand.tip).toFixed(2)}。`,
      link: `/groupbuy/${item.id}`,
      important: true,
      recipientUserId: item.ownerId || '',
      recipientName: item.owner,
      sourceType: 'groupbuy',
      sourceId: item.id,
    })
    return { ok: true, message: '接单成功，请在完成后标记送达', errand }
  }

  function completeErrand(id) {
    const item = getById(id)
    const errand = errandOf(item)
    if (!item || !errand) return { ok: false, message: '该拼单没有跑腿任务' }
    if (!isErrandRunner(item)) return { ok: false, message: '只有当前接单人可以标记完成' }
    if (errand.status !== 'accepted') {
      return { ok: false, message: '跑腿任务当前不在配送中' }
    }
    errand.status = 'delivered'
    errand.completedAt = new Date().toISOString()
    useNotifyStore().add({
      type: 'status',
      title: '跑腿任务等待确认',
      content: `${errand.runnerName} 已完成「${item.title}」的跑腿任务，请确认后结算小费。`,
      link: `/groupbuy/${item.id}`,
      important: true,
      recipientUserId: item.ownerId || '',
      recipientName: item.owner,
      sourceType: 'groupbuy',
      sourceId: item.id,
    })
    return { ok: true, message: '已标记送达，等待发起人确认', errand }
  }

  function confirmErrand(id) {
    const item = getById(id)
    const errand = errandOf(item)
    if (!item || !errand) return { ok: false, message: '该拼单没有跑腿任务' }
    if (!isOwner(item)) return { ok: false, message: '只有发起人可以确认完成并结算' }
    if (errand.status !== 'delivered') {
      return { ok: false, message: '跑腿者尚未标记送达' }
    }
    errand.status = 'settled'
    errand.confirmedAt = new Date().toISOString()
    errand.settledAmount = Number(errand.tip) || 0
    useNotifyStore().add({
      type: 'status',
      title: '跑腿小费已结算',
      content: `发起人已确认「${item.title}」完成，小费 ¥${errand.settledAmount.toFixed(2)} 已结算。`,
      link: `/groupbuy/${item.id}`,
      recipientUserId: errand.runnerId || '',
      recipientName: errand.runnerName,
      sourceType: 'groupbuy',
      sourceId: item.id,
    })
    return { ok: true, message: `任务完成，小费 ¥${errand.settledAmount.toFixed(2)} 已结算`, errand }
  }

  function cancelErrandByOwner(id, reason = '发起人取消跑腿任务') {
    const item = getById(id)
    const errand = errandOf(item)
    if (!item || !errand) return { ok: false, message: '该拼单没有跑腿任务' }
    if (!isOwner(item)) return { ok: false, message: '只有发起人可以取消跑腿任务' }
    if (!['open', 'accepted'].includes(errand.status)) {
      return { ok: false, message: '当前状态不能取消跑腿任务' }
    }
    const runner = errand.runnerName
    errand.status = 'cancelled'
    errand.cancelledAt = new Date().toISOString()
    errand.cancelReason = String(reason || '').trim()
    if (runner) {
      useNotifyStore().add({
        type: 'status',
        title: '跑腿任务已取消',
        content: `「${item.title}」的跑腿任务已取消：${errand.cancelReason || '发起人取消'}。`,
        link: `/groupbuy/${item.id}`,
        recipientUserId: errand.runnerId || '',
        recipientName: runner,
        sourceType: 'groupbuy',
        sourceId: item.id,
      })
    }
    return { ok: true, message: '跑腿任务已取消', errand }
  }

  function withdrawErrand(id, reason = '接单人暂时无法继续') {
    const item = getById(id)
    const errand = errandOf(item)
    if (!item || !errand) return { ok: false, message: '该拼单没有跑腿任务' }
    if (!isErrandRunner(item)) return { ok: false, message: '只有当前接单人可以退出任务' }
    if (errand.status !== 'accepted') {
      return { ok: false, message: '任务已送达，不能直接退出' }
    }
    const runnerName = errand.runnerName
    errand.status = 'open'
    errand.runnerId = ''
    errand.runnerName = ''
    errand.runnerContact = ''
    errand.acceptedAt = null
    errand.cancelReason = String(reason || '').trim()
    useNotifyStore().add({
      type: 'status',
      title: '跑腿者已退出任务',
      content: `${runnerName} 已退出「${item.title}」的跑腿任务，${errand.cancelReason || '任务重新开放接取'}。`,
      link: `/groupbuy/${item.id}`,
      important: true,
      recipientUserId: item.ownerId || '',
      recipientName: item.owner,
      sourceType: 'groupbuy',
      sourceId: item.id,
    })
    return { ok: true, message: '已退出跑腿，任务重新开放', errand }
  }

  function join(id, count = 1) {
    const item = getById(id)
    if (!item) return { ok: false, message: '拼单不存在' }
    if (statusOf(item) !== 'ongoing') return { ok: false, message: '该拼单已结束' }
    const user = useUserStore()
    const notify = useNotifyStore()
    const name = user.user?.name || '林小满'
    const exists = item.participants.find((p) => p.name === name)
    if (exists) {
      exists.count += count
    } else {
      item.participants.push({
        name,
        userId: user.user?.id || '',
        count,
        at: new Date().toISOString(),
      })
    }
    if (joinedCountOf(item) >= item.targetCount) {
      notify.add({
        type: 'match',
        title: '拼单成团啦',
        content: `「${item.title}」已满 ${item.targetCount} 份，等待发起人统一采购，记得按时取货。`,
        link: `/groupbuy/${item.id}`,
        recipientUserId: item.ownerId || '',
        recipientName: item.owner,
        sourceType: 'groupbuy',
        sourceId: item.id,
      })
    }
    return { ok: true, message: '接龙成功' }
  }

  function leave(id) {
    const item = getById(id)
    if (!item) return
    const user = useUserStore()
    const name = user.user?.name || '林小满'
    const exists = item.participants.find((p) => p.name === name)
    if (!exists) return
    exists.count -= 1
    if (exists.count <= 0) item.participants = item.participants.filter((p) => p.name !== name)
  }

  function remove(id) {
    const item = getById(id)
    if (!item || (!isOwner(item) && !useUserStore().isAdmin)) return false
    items.value = items.value.filter((i) => i.id !== id)
    return true
  }

  bindSharedState(V, items, '拼单集市')

  return {
    items,
    creating,
    keyword,
    category,
    ongoing,
    finished,
    mine,
    filtered,
    stats,
    joinedCountOf,
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
    create,
    acceptErrand,
    completeErrand,
    confirmErrand,
    cancelErrandByOwner,
    withdrawErrand,
    join,
    leave,
    remove,
  }
})
