import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { forumCategories, forumPosts } from '@/mock/seed'
import { buildForumDraft, similarForumPosts, sleep, summarizeForumReplies } from '@/utils/aiEngine'
import { uid } from '@/utils/format'
import { loadState } from '@/utils/storage'
import { bindSharedState } from '@/utils/cloudSync'
import { useNotifyStore } from './notify'
import { useUserStore } from './user'

const V = 'v5:forumPosts'
const TONES = ['brand', 'teal', 'amber', 'coral']

const SORTS = [
  { key: 'active', label: '最新回复' },
  { key: 'latest', label: '最新发布' },
  { key: 'hot', label: '最热讨论' },
]

function stamp(value) {
  const time = new Date(value || 0).getTime()
  return Number.isNaN(time) ? 0 : time
}

function lastActive(post) {
  const replies = post.replies || []
  const lastReply = replies.reduce((acc, r) => Math.max(acc, stamp(r.createdAt)), 0)
  return Math.max(lastReply, stamp(post.createdAt))
}

export const useForumStore = defineStore('forum', () => {
  const posts = ref(loadState(V, forumPosts).map((p) => ({ likedBy: [], ...p })))
  const posting = ref(false)
  const replying = ref(false)
  const keyword = ref('')
  const category = ref('全部')
  const sortBy = ref('active')

  const categories = computed(() =>
    forumCategories.map((name) => ({
      name,
      count: name === '全部' ? posts.value.length : posts.value.filter((p) => p.category === name).length,
    })),
  )

  const totalReplies = computed(() => posts.value.reduce((n, p) => n + (p.replies?.length || 0), 0))
  const solvedCount = computed(() => posts.value.filter((p) => p.solved).length)
  const unanswered = computed(() =>
    posts.value
      .filter((p) => !p.replies?.length)
      .sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt)),
  )

  const stats = computed(() => ({
    total: posts.value.length,
    replies: totalReplies.value,
    solved: solvedCount.value,
    pending: unanswered.value.length,
    today: posts.value.filter((p) => stamp(p.createdAt) >= stamp(new Date().toISOString().slice(0, 10))).length,
  }))

  const hotPosts = computed(() =>
    posts.value
      .slice()
      .sort((a, b) => (b.likes || 0) + (b.replies?.length || 0) * 2 - ((a.likes || 0) + (a.replies?.length || 0) * 2))
      .slice(0, 5),
  )

  const myPosts = computed(() => {
    const user = useUserStore()
    return posts.value.filter((p) => p.author === user.user?.name)
  })

  const filtered = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    const list = posts.value.filter((p) => {
      if (category.value !== '全部' && p.category !== category.value) return false
      if (!kw) return true
      const text = `${p.title} ${p.content} ${(p.tags || []).join(' ')} ${p.author}`.toLowerCase()
      return text.includes(kw)
    })
    const sorter = {
      active: (a, b) => lastActive(b) - lastActive(a),
      latest: (a, b) => stamp(b.createdAt) - stamp(a.createdAt),
      hot: (a, b) => (b.likes || 0) - (a.likes || 0) || (b.replies?.length || 0) - (a.replies?.length || 0),
    }[sortBy.value]
    return list.slice().sort(sorter)
  })

  function getById(id) {
    return posts.value.find((p) => p.id === id)
  }

  function canManagePost(post) {
    const user = useUserStore()
    if (!post) return false
    if (post.authorId && post.authorId === user.user?.id) return true
    return (
      post.author === user.user?.name ||
      user.can('forum.moderate') ||
      user.can('forum.delete.any')
    )
  }

  function touchView(id) {
    const post = getById(id)
    if (post) post.views = (post.views || 0) + 1
  }

  function pickTone(seedText = '') {
    let sum = 0
    for (const ch of String(seedText)) sum += ch.charCodeAt(0)
    return TONES[sum % TONES.length]
  }

  async function create(form) {
    posting.value = true
    await sleep(650)
    const user = useUserStore()
    const post = {
      id: uid('fp'),
      title: (form.title || '').trim(),
      category: form.category || '求助问答',
      content: (form.content || '').trim(),
      author: user.user?.name || '匿名同学',
      authorId: user.user?.id || '',
      ownerId: user.user?.id || '',
      authorRole: user.user?.role || '学生',
      avatarTone: pickTone(user.user?.name || form.title),
      tags: Array.isArray(form.tags) ? form.tags.filter(Boolean) : String(form.tags || '').split(/[,，、\s]+/).filter(Boolean),
      likes: 0,
      likedBy: [],
      views: 1,
      solved: false,
      aiGenerated: Boolean(form.aiGenerated),
      createdAt: new Date().toISOString(),
      replies: [],
    }
    posts.value.unshift(post)
    posting.value = false
    useNotifyStore().add({
      type: 'system',
      title: '帖子发布成功',
      content: `「${post.title}」已出现在校园论坛，AI 已为它匹配 ${similarTo(post).length} 条相似讨论。`,
      link: `/forum/${post.id}`,
      sourceType: 'forum',
      sourceId: post.id,
    })
    return post
  }

  async function reply(id, content, aiGenerated = false) {
    const post = getById(id)
    if (!post) return null
    replying.value = true
    await sleep(450)
    const user = useUserStore()
    const item = {
      id: uid('fr'),
      author: user.user?.name || '匿名同学',
      authorId: user.user?.id || '',
      authorRole: user.user?.role || '学生',
      content: String(content || '').trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
      aiGenerated,
    }
    if (!post.replies) post.replies = []
    post.replies.push(item)
    replying.value = false
    useNotifyStore().add({
      type: 'reply',
      title: `「${post.title}」收到新回复`,
      content: `${item.author}：${item.content.slice(0, 46)}${item.content.length > 46 ? '…' : ''}`,
      link: `/forum/${post.id}`,
      important: post.author !== item.author,
      recipientUserId: post.authorId || '',
      recipientName: post.author,
      sourceType: 'forum',
      sourceId: post.id,
    })
    return item
  }

  function toggleLike(id) {
    const post = getById(id)
    if (!post) return
    const user = useUserStore()
    const me = user.user?.name || '我'
    if (!Array.isArray(post.likedBy)) post.likedBy = []
    const index = post.likedBy.indexOf(me)
    if (index >= 0) {
      post.likedBy.splice(index, 1)
      post.likes = Math.max(0, (post.likes || 0) - 1)
    } else {
      post.likedBy.push(me)
      post.likes = (post.likes || 0) + 1
    }
  }

  function likeReply(postId, replyId) {
    const post = getById(postId)
    const item = post?.replies?.find((r) => r.id === replyId)
    if (!item) return
    item.liked = !item.liked
    item.likes = Math.max(0, (item.likes || 0) + (item.liked ? 1 : -1))
  }

  function markSolved(id, solved = true) {
    const post = getById(id)
    if (!post || !canManagePost(post)) return false
    post.solved = solved
    return true
  }

  function remove(id) {
    if (!canManagePost(getById(id))) return false
    posts.value = posts.value.filter((p) => p.id !== id)
    return true
  }

  function aiDraft(rawText) {
    return buildForumDraft(rawText)
  }

  function similarTo(draft, limit = 3) {
    return similarForumPosts(posts.value, draft || {}, limit)
  }

  function aiSummary(post) {
    return summarizeForumReplies(post || {})
  }

  function resetFilters() {
    keyword.value = ''
    category.value = '全部'
    sortBy.value = 'active'
  }

  bindSharedState(V, posts, '校园论坛')

  return {
    posts,
    posting,
    replying,
    keyword,
    category,
    sortBy,
    sorts: SORTS,
    categories,
    stats,
    hotPosts,
    myPosts,
    unanswered,
    filtered,
    getById,
    canManagePost,
    touchView,
    create,
    reply,
    toggleLike,
    likeReply,
    markSolved,
    remove,
    aiDraft,
    similarTo,
    aiSummary,
    resetFilters,
  }
})
