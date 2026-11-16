import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { lostfoundPosts } from '@/mock/seed'
import { buildLostfoundCopy, scoreLostPair, sleep } from '@/utils/aiEngine'
import { uid } from '@/utils/format'
import { loadState } from '@/utils/storage'
import { bindSharedState } from '@/utils/cloudSync'
import { useNotifyStore } from './notify'
import { useUserStore } from './user'

const V = 'v2:lostfoundPosts'

export const useLostfoundStore = defineStore('lostfound', () => {
  const posts = ref(loadState(V, lostfoundPosts))
  const publishing = ref(false)
  const keyword = ref('')
  const typeFilter = ref('all')
  const categoryFilter = ref('全部类别')

  const lostPosts = computed(() => posts.value.filter((p) => p.type === 'lost'))
  const foundPosts = computed(() => posts.value.filter((p) => p.type === 'found'))
  const openCount = computed(() => posts.value.filter((p) => p.status !== 'resolved').length)
  const resolvedCount = computed(() => posts.value.filter((p) => p.status === 'resolved').length)

  const filtered = computed(() => {
    const kw = keyword.value.trim()
    return posts.value.filter((p) => {
      if (typeFilter.value !== 'all' && p.type !== typeFilter.value) return false
      if (categoryFilter.value !== '全部类别' && p.category !== categoryFilter.value) return false
      if (kw && !`${p.title}${p.description}${p.place}${p.item}`.includes(kw)) return false
      return true
    })
  })

  /** 与某条信息互为反向、且相似度达标的线索 */
  function matchesFor(id) {
    const post = posts.value.find((p) => p.id === id)
    if (!post) return []
    return posts.value
      .filter((p) => p.id !== id && p.type !== post.type && p.status !== 'resolved')
      .map((p) => {
        const { score, reasons } = scoreLostPair(post, p)
        return { post: p, score, reasons }
      })
      .filter((m) => m.score >= 40)
      .sort((a, b) => b.score - a.score)
  }

  /** 全站高相似匹配对（用于广场顶部「AI 匹配雷达」） */
  const topPairs = computed(() => {
    const pairs = []
    lostPosts.value
      .filter((p) => p.status !== 'resolved')
      .forEach((lost) => {
        foundPosts.value
          .filter((p) => p.status !== 'resolved')
          .forEach((found) => {
            const { score, reasons } = scoreLostPair(lost, found)
            if (score >= 55) pairs.push({ lost, found, score, reasons })
          })
      })
    return pairs.sort((a, b) => b.score - a.score).slice(0, 3)
  })

  function generateCopy(form) {
    return buildLostfoundCopy(form)
  }

  function rewardOf(post) {
    if (!post || post.type !== 'lost') return { enabled: false, amount: 0 }
    const amount = Math.max(0, Number(post.rewardAmount) || 0)
    return {
      enabled: Boolean(post.rewardEnabled && amount > 0),
      amount,
      note: String(post.rewardNote || ''),
    }
  }

  function claimsOf(post) {
    return Array.isArray(post?.claims) ? post.claims : []
  }

  function myActiveClaim(post) {
    const user = useUserStore()
    return claimsOf(post).find(
      (claim) =>
        claim.helperId === user.user?.id &&
        !['cancelled', 'rewarded', 'picked_up'].includes(claim.status),
    ) || null
  }

  const myLostPosts = computed(() => {
    const user = useUserStore()
    return posts.value.filter(
      (post) =>
        post.type === 'lost' &&
        isOwner(post) &&
        post.status !== 'resolved',
    )
  })

  function isOwner(post) {
    const user = useUserStore()
    if (!post) return false
    if (post.ownerId) return post.ownerId === user.user?.id
    return post.author === user.user?.name || Boolean(post.contact?.includes(user.user?.name))
  }

  function canManage(post) {
    return isOwner(post) || Boolean(useUserStore().isAdmin)
  }

  async function publish(form) {
    publishing.value = true
    await sleep(700)
    const user = useUserStore()
    const notify = useNotifyStore()
    const post = {
      id: uid('lf'),
      type: form.type || 'lost',
      title: form.title,
      item: form.item,
      category: form.category || '其他',
      color: form.color || '',
      place: form.place || '校园内',
      timeText: form.time || '今天',
      description: form.description || '',
      contact: form.contact || '站内联系',
      contactMasked: `${(user.user?.name || '同学').slice(0, 1)}**`,
      ownerId: user.user?.id || '',
      authorId: user.user?.id || '',
      author: user.user?.name || '匿名同学',
      aiGenerated: Boolean(form.aiGenerated),
      status: 'matching',
      tone: form.tone || (form.type === 'found' ? 'teal' : 'amber'),
      createdAt: new Date().toISOString(),
      postNo: `LF${Date.now().toString().slice(-10)}`,
      tags: form.tags || [form.color, form.item, form.place].filter(Boolean),
      image: form.image || null,
      rewardEnabled: form.type === 'lost' && Boolean(form.rewardEnabled),
      rewardAmount:
        form.type === 'lost' && form.rewardEnabled
          ? Math.max(0.01, Number(form.rewardAmount) || 0)
          : 0,
      rewardNote: form.type === 'lost' ? String(form.rewardNote || '') : '',
      claims: [],
    }
    posts.value.unshift(post)
    publishing.value = false

    const matches = matchesFor(post.id)
    if (matches.length) {
      notify.add({
        type: 'match',
        title: `AI 找到 ${matches.length} 条${post.type === 'lost' ? '招领' : '寻物'}线索`,
        content: `「${matches[0].post.title}」与你的信息相似度 ${matches[0].score}%，可以去广场看看。`,
        link: '/lostfound',
        important: true,
        sourceType: 'lostfound',
        sourceId: post.id,
      })
    } else {
      notify.add({
        type: 'status',
        title: '信息发布成功',
        content: `「${post.title}」已展示在失物招领广场，AI 会持续为你匹配线索。`,
        link: '/lostfound',
        sourceType: 'lostfound',
        sourceId: post.id,
      })
    }
    return post
  }

  function submitClaim(id, payload = {}) {
    const post = posts.value.find((item) => item.id === id)
    const user = useUserStore()
    if (!post || post.type !== 'lost') return { ok: false, message: '只有寻物信息可以提交线索' }
    if (post.status === 'resolved') return { ok: false, message: '该物品已经完成找回' }
    if (isOwner(post)) return { ok: false, message: '发布者不能给自己的寻物信息提交线索' }
    if (myActiveClaim(post)) return { ok: false, message: '你已经提交过线索，请等待发布者处理' }
    const description = String(payload.description || '').trim()
    const contact = String(payload.contact || '站内联系').trim()
    if (!description) return { ok: false, message: '请补充线索或归还说明' }
    const claim = {
      id: uid('claim'),
      helperId: user.user?.id || '',
      helperName: user.user?.name || '匿名同学',
      contact,
      mode: payload.mode === 'returned' ? 'returned' : 'clue',
      description,
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (!Array.isArray(post.claims)) post.claims = []
    post.claims.unshift(claim)
    useNotifyStore().add({
      type: 'match',
      title: claim.mode === 'returned' ? '有人标记已归还你的物品' : '有人提供了新的寻物线索',
      content: `${claim.helperName}：${description.slice(0, 60)}${description.length > 60 ? '…' : ''}`,
      link: '/lostfound',
      important: true,
      recipientUserId: post.ownerId || '',
      recipientName: post.author || '',
      sourceType: 'lostfound',
      sourceId: post.id,
    })
    return { ok: true, message: '线索已提交，等待发布者确认', claim }
  }

  function claimFoundItem(foundId, payload = {}) {
    const foundPost = posts.value.find((item) => item.id === foundId)
    const lostPost = posts.value.find((item) => item.id === payload.lostPostId)
    const user = useUserStore()
    if (!foundPost || foundPost.type !== 'found') {
      return { ok: false, message: '招领信息不存在' }
    }
    if (foundPost.status === 'resolved') {
      return { ok: false, message: '该物品已经被认领' }
    }
    if (isOwner(foundPost)) {
      return { ok: false, message: '不能认领自己发布的招领信息' }
    }
    if (!lostPost || lostPost.type !== 'lost' || !isOwner(lostPost)) {
      return { ok: false, message: '请选择一条由你发布且仍在寻找中的寻物信息' }
    }
    if (lostPost.status === 'resolved') {
      return { ok: false, message: '所选寻物信息已经完成' }
    }
    const existing = claimsOf(foundPost).find(
      (claim) =>
        claim.kind === 'found_claim' &&
        claim.claimantId === user.user?.id &&
        ['submitted', 'approved'].includes(claim.status),
    )
    if (existing) return { ok: false, message: '你已经提交过认领申请' }
    const description = String(payload.description || '').trim()
    if (!description) return { ok: false, message: '请补充能够核验物品归属的说明' }
    const reward = rewardOf(lostPost)
    const claim = {
      id: uid('found_claim'),
      kind: 'found_claim',
      helperId: user.user?.id || '',
      claimantId: user.user?.id || '',
      claimantName: user.user?.name || '匿名同学',
      helperName: user.user?.name || '匿名同学',
      lostPostId: lostPost.id,
      lostPostTitle: lostPost.title,
      contact: String(payload.contact || '站内联系').trim(),
      mode: 'found_claim',
      description,
      rewardEnabled: reward.enabled,
      rewardAmount: reward.amount,
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (!Array.isArray(foundPost.claims)) foundPost.claims = []
    foundPost.claims.unshift(claim)
    useNotifyStore().add({
      type: 'match',
      title: '收到新的失物认领申请',
      content: `${claim.claimantName} 认领「${foundPost.title}」，关联寻物：${lostPost.title}`,
      link: '/lostfound',
      important: true,
      recipientUserId: foundPost.ownerId || '',
      recipientName: foundPost.author || '',
      sourceType: 'lostfound',
      sourceId: foundPost.id,
    })
    return { ok: true, message: '认领申请已提交，等待招领发布者核验', claim }
  }

  function reviewFoundClaim(foundId, claimId, approved, reason = '') {
    const foundPost = posts.value.find((item) => item.id === foundId)
    if (!foundPost || foundPost.type !== 'found' || !canManage(foundPost)) {
      return { ok: false, message: '只有招领发布者可以审核认领申请' }
    }
    const claim = claimsOf(foundPost).find(
      (item) => item.id === claimId && item.kind === 'found_claim',
    )
    if (!claim || claim.status !== 'submitted') {
      return { ok: false, message: '认领申请已经处理' }
    }
    claim.status = approved ? 'approved' : 'rejected'
    claim.reviewedAt = new Date().toISOString()
    claim.updatedAt = claim.reviewedAt
    claim.reviewNote = String(reason || '').trim()
    if (approved) foundPost.status = 'claimed_pending'
    useNotifyStore().add({
      type: 'status',
      title: approved ? '失物认领申请已通过' : '失物认领申请未通过',
      content: approved
        ? `「${foundPost.title}」已完成归属核验，请确认领取${claim.rewardEnabled ? `并打赏 ¥${Number(claim.rewardAmount).toFixed(2)}` : ''}。`
        : `「${foundPost.title}」的认领申请未通过：${claim.reviewNote || '请补充物品特征后重试'}`,
      link: '/lostfound',
      important: approved,
      recipientUserId: claim.claimantId || '',
      recipientName: claim.claimantName,
      sourceType: 'lostfound',
      sourceId: foundPost.id,
    })
    return {
      ok: true,
      message: approved ? '已通过认领申请，等待失主确认领取' : '已驳回认领申请',
      claim,
    }
  }

  function completeFoundClaim(foundId, claimId) {
    const foundPost = posts.value.find((item) => item.id === foundId)
    const user = useUserStore()
    if (!foundPost || foundPost.type !== 'found') {
      return { ok: false, message: '招领信息不存在' }
    }
    const claim = claimsOf(foundPost).find(
      (item) => item.id === claimId && item.kind === 'found_claim',
    )
    if (!claim || claim.claimantId !== user.user?.id) {
      return { ok: false, message: '只有申请人可以确认领取' }
    }
    if (claim.status !== 'approved') {
      return { ok: false, message: '认领申请尚未通过审核' }
    }
    const lostPost = posts.value.find((item) => item.id === claim.lostPostId)
    if (!lostPost || !isOwner(lostPost)) {
      return { ok: false, message: '关联的寻物信息不存在或不属于当前账号' }
    }
    const completedAt = new Date().toISOString()
    claim.status = claim.rewardEnabled ? 'rewarded' : 'claimed'
    claim.completedAt = completedAt
    claim.updatedAt = completedAt
    claim.settledAmount = claim.rewardEnabled ? Number(claim.rewardAmount) || 0 : 0
    foundPost.status = 'resolved'
    foundPost.resolvedAt = completedAt
    foundPost.claimedBy = claim.claimantId
    lostPost.status = 'resolved'
    lostPost.resolvedAt = completedAt
    lostPost.claimedFoundPostId = foundPost.id
    useNotifyStore().add({
      type: 'status',
      title: claim.rewardEnabled ? '失物认领完成并收到寻物打赏' : '失物认领已完成',
      content: claim.rewardEnabled
        ? `「${foundPost.title}」认领完成，寻物发布者已记录打赏 ¥${Number(claim.settledAmount).toFixed(2)}。`
        : `「${foundPost.title}」认领完成，双方已确认现场领取。`,
      link: '/lostfound',
      recipientUserId: foundPost.ownerId || '',
      recipientName: foundPost.author || '',
      sourceType: 'lostfound',
      sourceId: foundPost.id,
    })
    return {
      ok: true,
      message: claim.rewardEnabled
        ? `认领完成，已记录打赏 ¥${Number(claim.settledAmount).toFixed(2)}`
        : '认领完成，寻物与招领信息均已结束',
      claim,
    }
  }

  function rewardClaim(postId, claimId, amount) {
    const post = posts.value.find((item) => item.id === postId)
    if (!post || !isOwner(post) || post.type !== 'lost') {
      return { ok: false, message: '只有寻物发布者可以打赏' }
    }
    const reward = rewardOf(post)
    if (!reward.enabled) return { ok: false, message: '这条寻物信息未设置打赏' }
    const claim = claimsOf(post).find((item) => item.id === claimId)
    if (!claim || claim.status !== 'submitted') {
      return { ok: false, message: '该线索已经处理或已取消' }
    }
    const settledAmount = Math.max(0.01, Number(amount) || reward.amount)
    claim.status = 'rewarded'
    claim.rewardAmount = settledAmount
    claim.settledAt = new Date().toISOString()
    claim.updatedAt = claim.settledAt
    post.status = 'resolved'
    post.resolvedAt = claim.settledAt
    useNotifyStore().add({
      type: 'status',
      title: '你收到了寻物打赏',
      content: `「${post.title}」的发布者已确认向你打赏 ¥${settledAmount.toFixed(2)}。`,
      link: '/lostfound',
      recipientUserId: claim.helperId || '',
      recipientName: claim.helperName,
      sourceType: 'lostfound',
      sourceId: post.id,
    })
    return { ok: true, message: `已确认打赏 ¥${settledAmount.toFixed(2)}`, claim }
  }

  function confirmSelfPickup(postId, claimId) {
    const post = posts.value.find((item) => item.id === postId)
    if (!post || !isOwner(post) || post.type !== 'lost') {
      return { ok: false, message: '只有寻物发布者可以确认领取' }
    }
    const claim = claimsOf(post).find((item) => item.id === claimId)
    if (!claim || claim.status !== 'submitted') {
      return { ok: false, message: '该线索已经处理或已取消' }
    }
    claim.status = 'picked_up'
    claim.settledAt = new Date().toISOString()
    claim.updatedAt = claim.settledAt
    post.status = 'resolved'
    post.resolvedAt = claim.settledAt
    useNotifyStore().add({
      type: 'status',
      title: '失主已确认自行领取',
      content: `「${post.title}」的发布者已通过你提供的方式完成领取。`,
      link: '/lostfound',
      recipientUserId: claim.helperId || '',
      recipientName: claim.helperName,
      sourceType: 'lostfound',
      sourceId: post.id,
    })
    return { ok: true, message: '已确认自行领取并结束本次寻物', claim }
  }

  function cancelClaim(postId, claimId) {
    const post = posts.value.find((item) => item.id === postId)
    const user = useUserStore()
    if (!post) return { ok: false, message: '信息不存在' }
    const claim = claimsOf(post).find((item) => item.id === claimId)
    if (!claim || !['submitted'].includes(claim.status)) {
      return { ok: false, message: '该线索当前不能取消' }
    }
    const canCancel =
      claim.helperId === user.user?.id ||
      canManage(post)
    if (!canCancel) return { ok: false, message: '无权取消该线索' }
    claim.status = 'cancelled'
    claim.updatedAt = new Date().toISOString()
    return { ok: true, message: '线索已取消', claim }
  }

  function resolve(id) {
    const post = posts.value.find((p) => p.id === id)
    if (!post) return false
    if (!canManage(post)) return false
    post.status = 'resolved'
    post.resolvedAt = new Date().toISOString()
    useNotifyStore().add({
      type: 'status',
      title: '失物信息已完成',
      content: `「${post.title}」已标记为完成，感谢你的帮助。`,
      link: '/lostfound',
    })
    return true
  }

  function reopen(id) {
    const post = posts.value.find((p) => p.id === id)
    if (!post) return false
    if (!canManage(post)) return false
    post.status = 'matching'
    return true
  }

  function remove(id) {
    const post = posts.value.find((p) => p.id === id)
    if (!post) return false
    if (!canManage(post)) return false
    posts.value = posts.value.filter((p) => p.id !== id)
    return true
  }

  function resetFilters() {
    keyword.value = ''
    typeFilter.value = 'all'
    categoryFilter.value = '全部类别'
  }

  bindSharedState(V, posts, '失物招领')

  return {
    posts,
    publishing,
    keyword,
    typeFilter,
    categoryFilter,
    lostPosts,
    foundPosts,
    openCount,
    resolvedCount,
    filtered,
    topPairs,
    matchesFor,
    generateCopy,
    rewardOf,
    claimsOf,
    myActiveClaim,
    myLostPosts,
    isOwner,
    canManage,
    publish,
    submitClaim,
    claimFoundItem,
    reviewFoundClaim,
    completeFoundClaim,
    rewardClaim,
    confirmSelfPickup,
    cancelClaim,
    resolve,
    reopen,
    remove,
    resetFilters,
  }
})
