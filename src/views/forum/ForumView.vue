<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Bell,
  ChatDotRound,
  ChatLineRound,
  CircleCheck,
  Clock,
  Connection,
  EditPen,
  InfoFilled,
  MagicStick,
  Plus,
  QuestionFilled,
  Search,
  View,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatTile from '@/components/StatTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import AiThinking from '@/components/AiThinking.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useForumStore } from '@/stores/forum'
import { useUserStore } from '@/stores/user'
import { forumTagOptions } from '@/mock/seed'
import { generateWithCloud } from '@/utils/aiCloud'
import { timeAgo } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const forum = useForumStore()
const user = useUserStore()

const currentUserName = computed(() => user.user?.name || '林小满')
const categoryOptions = computed(() => forum.categories.filter((item) => item.name !== '全部'))

const DRAFT_STEPS = ['识别关键词', '匹配分类与标签', '生成草稿']

const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const dialogWidth = computed(() => (viewportWidth.value < 720 ? '92vw' : '640px'))

const onlyUnresolved = ref(false)
const filterList = computed(() =>
  forum.filtered.filter((post) => !onlyUnresolved.value || !post.solved),
)
const hasFilter = computed(
  () => Boolean(forum.keyword.trim()) || forum.category !== '全部' || onlyUnresolved.value,
)
const helpPosts = computed(() =>
  forum.unanswered.filter((post) => post.category === '求助问答').slice(0, 4),
)

const createOpen = ref(false)
const sideDraft = ref('')
const aiInput = ref('')
const aiInputRef = ref(null)
const drafting = ref(false)
const draftSimilar = ref([])
const previewSimilarId = ref('')
const aiNotice = ref('')
const aiUsed = ref(false)
const formRef = ref(null)
const form = reactive({
  title: '',
  category: '求助问答',
  content: '',
  tags: [],
})

const tagChoices = computed(() => {
  const list = [...forumTagOptions]
  form.tags.forEach((tag) => {
    if (!list.includes(tag)) list.push(tag)
  })
  return list
})

const rules = {
  title: [
    { required: true, message: '给帖子起个标题吧', trigger: 'blur' },
    {
      trigger: ['blur', 'change'],
      validator: (_rule, value, callback) => {
        const text = String(value || '').trim()
        if (!text) return callback()
        if (text.length < 4) return callback(new Error('标题至少 4 个字'))
        if (text.length > 40) return callback(new Error('标题不超过 40 个字'))
        return callback()
      },
    },
  ],
  content: [
    { required: true, message: '正文还没写呢', trigger: 'blur' },
    {
      trigger: ['blur', 'change'],
      validator: (_rule, value, callback) => {
        const text = String(value || '').trim()
        if (!text) return callback()
        if (text.length < 10) return callback(new Error('正文至少 10 个字，多写一点更容易被回复'))
        return callback()
      },
    },
  ],
}

function replyCount(post) {
  return (post.replies || []).length
}

function isStaff(post) {
  return ['管理员', '高级管理员', '论坛坛主', '论坛版主'].includes(post.authorRole)
}

function isLiked(post) {
  return (post.likedBy || []).includes(currentUserName.value)
}

function clearFilters() {
  forum.resetFilters()
  onlyUnresolved.value = false
}

function openPost(post) {
  router.push(`/forum/${post.id}`)
}

function goCategory(name) {
  forum.category = name
  onlyUnresolved.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleLike(post) {
  forum.toggleLike(post.id)
}

function onResize() {
  viewportWidth.value = window.innerWidth
}

function resetForm() {
  form.title = ''
  form.category = '求助问答'
  form.content = ''
  form.tags = []
  aiUsed.value = false
  aiInput.value = ''
  draftSimilar.value = []
  previewSimilarId.value = ''
  aiNotice.value = ''
  nextTick(() => formRef.value?.clearValidate())
}

function openPublish(focusAi = false) {
  resetForm()
  createOpen.value = true
  if (focusAi) {
    setTimeout(() => aiInputRef.value?.focus(), 80)
  }
}

function startSideDraft() {
  const text = sideDraft.value.trim()
  openPublish(true)
  sideDraft.value = ''
  if (!text) return
  aiInput.value = text
  nextTick(() => {
    runDraft()
  })
}

function toggleTag(tag) {
  const index = form.tags.indexOf(tag)
  if (index >= 0) {
    form.tags.splice(index, 1)
    return
  }
  if (form.tags.length >= 3) {
    ElMessage.warning('最多选择 3 个标签')
    return
  }
  form.tags.push(tag)
}

async function runDraft() {
  if (drafting.value) return
  const text = aiInput.value.trim()
  if (!text) {
    ElMessage.warning('先用一句话说说你想聊什么')
    aiInputRef.value?.focus()
    return
  }
  drafting.value = true
  previewSimilarId.value = ''
  let draft
  try {
    const response = await generateWithCloud('forum_draft', { text })
    const result = response.result || {}
    if (!result.title || !result.content) throw new Error('模型返回内容不完整')
    draft = {
      title: String(result.title).slice(0, 40),
      category: String(result.category || '求助问答'),
      content: String(result.content).slice(0, 1200),
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 3).map(String) : [],
    }
    aiNotice.value = `本次草稿由 ${response.engine || 'DeepSeek-V4.1-Flash'} 生成`
  } catch (error) {
    draft = forum.aiDraft(text)
    aiNotice.value = `DeepSeek 暂不可用，已使用本地规则生成草稿：${error?.message || error}`
    ElMessage.warning(aiNotice.value)
  }
  form.title = draft.title
  form.category = categoryOptions.value.some((item) => item.name === draft.category)
    ? draft.category
    : '求助问答'
  form.content = draft.content
  form.tags = (draft.tags || []).slice(0, 3)
  draftSimilar.value = forum.similarTo(draft)
  aiUsed.value = true
  drafting.value = false
  nextTick(() => formRef.value?.clearValidate(['title', 'content']))
  ElMessage.success('AI 草稿已生成，可以按自己的语气再改一改')
}

function previewSimilar(item) {
  previewSimilarId.value = previewSimilarId.value === item.id ? '' : item.id
}

async function submitCreate() {
  if (forum.posting || !formRef.value) return
  let valid = false
  try {
    valid = await formRef.value.validate()
  } catch {
    valid = false
  }
  if (!valid) return
  const post = await forum.create({
    ...form,
    tags: [...form.tags],
    aiGenerated: aiUsed.value,
  })
  createOpen.value = false
  ElMessage.success('帖子已发布，AI 正在为它寻找同频讨论')
  router.push(`/forum/${post.id}`)
}

function applyAiQuery() {
  const query = route.query
  if (!query || (!query.create && query.from !== 'ai')) return
  const title = String(query.title || '')
  const content = String(query.content || '')
  const category = String(query.category || '')
  const tags = String(query.tags || '')
    .split(/[,，、\s]+/)
    .filter(Boolean)
    .slice(0, 3)
  const hasPrefill = Boolean(title || content || tags.length)
  openPublish(false)
  if (hasPrefill) {
    form.title = title
    form.category = categoryOptions.value.some((item) => item.name === category)
      ? category
      : '求助问答'
    form.content = content
    form.tags = tags
    aiUsed.value = true
    draftSimilar.value = forum.similarTo({
      title: form.title,
      category: form.category,
      tags: [...form.tags],
    })
    aiNotice.value = '已根据你的描述预填标题、分类与正文，发布前可以按自己的语气再改一改。'
    nextTick(() => formRef.value?.clearValidate())
  } else {
    aiNotice.value = '已为你打开发帖入口。先说一句话，AI 可以帮你理成标题、正文和标签。'
  }
}

function clearAiQuery() {
  if (route.query.create || route.query.from) router.replace({ path: '/forum' })
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  applyAiQuery()
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
watch(
  () => route.query,
  (query) => {
    if (query && Object.keys(query).length) applyAiQuery()
  },
)
</script>

<template>
  <div class="page forum-page">
    <PageHeader
      eyebrow="场景 04 · 同频讨论"
      title="校园论坛"
      desc="发帖求助、分享讨论，AI 帮你想标题、找同频帖。"
    >
      <template #meta>
        <div class="forum-meta">
          <span class="tag-soft tag-soft--coral"><span class="dot"></span>同频讨论 · 友善交流</span>
          <AiBadge ghost small text="AI 版主在线" />
          <span class="t-xs faint">
            共 {{ forum.stats.total }} 条讨论 · {{ forum.stats.pending }} 个问题等待回复
          </span>
        </div>
      </template>
      <template #actions>
        <div class="forum-head-actions">
          <el-button :icon="MagicStick" @click="openPublish(true)">AI 帮我发帖</el-button>
          <el-button type="primary" :icon="Plus" @click="openPublish(false)">发布帖子</el-button>
        </div>
      </template>
    </PageHeader>

    <div class="grid g4 forum-stats">
      <StatTile
        label="帖子总数"
        :value="forum.stats.total"
        suffix="篇"
        hint="校园里的真实讨论"
        tone="brand"
        compact
      >
        <template #icon><el-icon><ChatDotRound /></el-icon></template>
      </StatTile>
      <StatTile
        label="今日新帖"
        :value="forum.stats.today"
        suffix="篇"
        hint="今天刚冒出来的话题"
        tone="teal"
        compact
      >
        <template #icon><el-icon><Clock /></el-icon></template>
      </StatTile>
      <StatTile
        label="回复总数"
        :value="forum.stats.replies"
        suffix="条"
        hint="每一句回应都算数"
        tone="amber"
        compact
      >
        <template #icon><el-icon><ChatLineRound /></el-icon></template>
      </StatTile>
      <StatTile
        label="待回复"
        :value="forum.stats.pending"
        suffix="篇"
        hint="等你来帮忙的求助"
        tone="coral"
        compact
      >
        <template #icon><el-icon><QuestionFilled /></el-icon></template>
      </StatTile>
    </div>

    <div class="grid g-7-5 forum-main">
      <div class="forum-feed">
        <div class="card forum-toolbar">
          <div class="forum-toolbar__cats">
            <span class="filter-label">分类</span>
            <div class="chip-row">
              <button
                v-for="cat in forum.categories"
                :key="cat.name"
                type="button"
                class="chip chip--sm"
                :class="{ 'is-active': forum.category === cat.name }"
                @click="forum.category = cat.name"
              >
                {{ cat.name }}
                <span class="chip__count">{{ cat.count }}</span>
              </button>
            </div>
          </div>

          <div class="forum-toolbar__row">
            <el-input
              v-model="forum.keyword"
              class="forum-search"
              :prefix-icon="Search"
              clearable
              placeholder="搜索标题、正文、标签或作者"
            />
            <div class="sort-group">
              <span class="filter-label">排序</span>
              <div class="chip-row">
                <button
                  v-for="sort in forum.sorts"
                  :key="sort.key"
                  type="button"
                  class="chip chip--sm"
                  :class="{ 'is-active': forum.sortBy === sort.key }"
                  @click="forum.sortBy = sort.key"
                >
                  {{ sort.label }}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="chip chip--sm unresolved-chip"
              :class="{ 'is-active': onlyUnresolved }"
              @click="onlyUnresolved = !onlyUnresolved"
            >
              <el-icon><CircleCheck /></el-icon>只看未解决
            </button>
          </div>

          <div class="forum-toolbar__foot">
            <span>共 {{ filterList.length }} 条</span>
            <button v-if="hasFilter" type="button" class="link-btn" @click="clearFilters">
              清空筛选
            </button>
            <span class="grow"></span>
            <span class="forum-toolbar__hint">AI 已为每篇帖子标注相似讨论</span>
          </div>
        </div>

        <div v-if="filterList.length" class="forum-list">
          <article
            v-for="post in filterList"
            :key="post.id"
            class="card card--hover post-card"
            @click="openPost(post)"
          >
            <div class="post-card__top">
              <UserAvatar
                class="avatar"
                :name="post.author"
                :user-id="post.authorId"
                :src="post.avatarUrl"
                :size="44"
              />
              <div class="post-card__who">
                <div class="post-card__name">
                  {{ post.author }}
                  <span class="role-chip" :class="{ 'role-chip--staff': isStaff(post) }">
                    {{ post.authorRole }}
                  </span>
                </div>
                <div class="post-card__sub">
                  <span>{{ timeAgo(post.createdAt) }}</span>
                  <span class="dot-sep">·</span>
                  <span>{{ post.views }} 次浏览</span>
                </div>
              </div>
              <div class="post-card__flags">
                <span class="tag-soft tag-soft--brand">{{ post.category }}</span>
                <StatusPill v-if="post.solved" status="resolved" text="已解决" />
                <AiBadge v-if="post.aiGenerated" ghost small />
              </div>
            </div>

            <h3 class="post-card__title">{{ post.title }}</h3>
            <p class="post-card__desc clamp-2">{{ post.content }}</p>

            <div v-if="post.tags?.length" class="post-card__tags">
              <span v-for="tag in post.tags" :key="tag" class="tag-soft">#{{ tag }}</span>
            </div>

            <div class="post-card__foot">
              <button
                type="button"
                class="like-btn"
                :class="{ 'is-liked': isLiked(post) }"
                :aria-label="isLiked(post) ? '取消点赞' : '点赞'"
                @click.stop="toggleLike(post)"
              >
                <span class="like-btn__heart">{{ isLiked(post) ? '♥' : '♡' }}</span>
                {{ post.likes }}
              </button>
              <span class="meta-item"><el-icon><View /></el-icon>{{ post.views }}</span>
              <span class="meta-item">
                <el-icon><ChatLineRound /></el-icon>{{ replyCount(post) }} 回复
              </span>
              <span class="post-card__more">查看讨论 <el-icon><ArrowRight /></el-icon></span>
            </div>
          </article>
        </div>

        <div v-else class="card forum-empty">
          <EmptyState
            title="没有找到匹配的帖子"
            desc="换个关键词或分类再试试；也可以发布一条新讨论，让 AI 帮你找到同频的同学。"
          >
            <el-button @click="clearFilters">清空筛选</el-button>
            <el-button type="primary" :icon="Plus" @click="openPublish(false)">发布帖子</el-button>
          </EmptyState>
        </div>
      </div>

      <aside class="forum-side">
        <SectionCard title="本周热帖" desc="按点赞与回复热度排序">
          <template #actions><span class="tag-soft">TOP 5</span></template>
          <button
            v-for="(item, index) in forum.hotPosts"
            :key="item.id"
            type="button"
            class="hot-row"
            @click="openPost(item)"
          >
            <span class="hot-row__rank mono" :class="{ 'is-top': index < 3 }">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <span class="hot-row__body">
              <span class="hot-row__title clamp-2">{{ item.title }}</span>
              <span class="hot-row__meta">{{ replyCount(item) }} 回复 · {{ item.likes }} 赞</span>
            </span>
            <el-icon class="hot-row__arrow"><ArrowRight /></el-icon>
          </button>
        </SectionCard>

        <SectionCard title="待回复求助" desc="这些问题还没人接话，等你来帮忙">
          <template #actions>
            <span class="tag-soft tag-soft--coral">{{ helpPosts.length }}</span>
          </template>
          <template v-if="helpPosts.length">
            <button
              v-for="item in helpPosts"
              :key="item.id"
              type="button"
              class="help-row"
              @click="openPost(item)"
            >
              <span class="help-row__title">{{ item.title }}</span>
              <span class="help-row__meta">{{ timeAgo(item.createdAt) }} · 0 回复</span>
            </button>
          </template>
          <EmptyState
            v-else
            compact
            title="暂时没有待回复的求助"
            desc="你可以先发一条，AI 会帮它找到可能懂的同学。"
          />
          <button type="button" class="link-btn help-more" @click="goCategory('求助问答')">
            查看全部求助 →
          </button>
        </SectionCard>

        <div class="card card--gradient ai-guide">
          <div class="ai-guide__head">
            <span class="ai-guide__orb" aria-hidden="true"><el-icon><MagicStick /></el-icon></span>
            <div class="ai-guide__headtext">
              <h3 class="ai-guide__title">
                让 AI 帮你开头
                <AiBadge ghost small text="AI 助手" />
              </h3>
              <p class="ai-guide__desc">一句话说清想聊什么，AI 补全草稿。</p>
            </div>
          </div>

          <div class="ai-guide__composer">
            <el-input
              v-model="sideDraft"
              class="ai-guide__input"
              maxlength="80"
              clearable
              aria-label="用一句话描述你想发布的内容"
              placeholder="例如：A栋插座多不多？"
              @keyup.enter="startSideDraft"
            />
            <el-button
              type="primary"
              class="ai-guide__btn"
              :icon="MagicStick"
              aria-label="让 AI 起草"
              @click="startSideDraft"
            >
              起草
            </el-button>
          </div>

          <ul class="ai-guide__list">
            <li><el-icon><EditPen /></el-icon>标题、正文、标签一次生成</li>
            <li><el-icon><Connection /></el-icon>发布前自动查重相似讨论</li>
            <li><el-icon><Bell /></el-icon>有人回复时提醒你回来看看</li>
          </ul>
          <p class="ai-guide__note">
            <el-icon><Clock /></el-icon>几秒生成草稿，发布前可逐字修改
          </p>
        </div>

        <SectionCard class="rules-card" title="论坛公约" desc="让每个问题都被认真回答">
          <template #actions>
            <span class="tag-soft tag-soft--teal">3 条约定</span>
          </template>
          <ul class="rule-list">
            <li>
              <span class="rule-no mono" aria-hidden="true">01</span>
              <div>
                <b>友善讨论</b>
                <p>对事不对人，不嘲讽、不挂人；不同观点好好说。</p>
              </div>
            </li>
            <li>
              <span class="rule-no mono" aria-hidden="true">02</span>
              <div>
                <b>隐私脱敏</b>
                <p>不公开真实姓名、手机号和宿舍号，截图先打码。</p>
              </div>
            </li>
            <li>
              <span class="rule-no mono" aria-hidden="true">03</span>
              <div>
                <b>AI 内容有标识</b>
                <p>AI 起草的帖子会带标识，发布前请确认信息准确。</p>
              </div>
            </li>
          </ul>
          <div class="rule-foot">
            <el-icon><InfoFilled /></el-icon>
            <span>AI 版主会折叠广告与不友善内容，有疑问回帖即可。</span>
          </div>
        </SectionCard>
      </aside>
    </div>

    <el-dialog
      v-model="createOpen"
      class="forum-dialog"
      @closed="clearAiQuery"
      :width="dialogWidth"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!forum.posting"
      :close-on-press-escape="!forum.posting && !drafting"
      :show-close="!forum.posting && !drafting"
    >
      <template #header>
        <div class="pub-head">
          <h3>发布帖子</h3>
          <p>先让 AI 起草，或者直接写下你想讨论的事。</p>
        </div>
      </template>

      <div v-if="aiNotice" class="notice forum-notice">
        <el-icon><MagicStick /></el-icon>
        <div class="grow">
          <p>{{ aiNotice }}</p>
        </div>
        <button type="button" class="notice-close" aria-label="关闭提示" @click="aiNotice = ''">×</button>
      </div>

      <section class="draft-panel">
        <div class="draft-panel__head">
          <span class="draft-panel__icon"><el-icon><MagicStick /></el-icon></span>
          <div class="grow">
            <div class="draft-panel__title">
              一句话告诉 AI
              <AiBadge v-if="aiUsed" text="AI 起草，可修改" small />
            </div>
            <p class="draft-panel__desc">
              说说你的问题或想分享的事，AI 会补全标题、分类、标签和正文草稿。
            </p>
          </div>
        </div>

        <div class="draft-panel__row">
          <el-input
            ref="aiInputRef"
            v-model="aiInput"
            maxlength="80"
            clearable
            placeholder="例如：A栋三楼插座多不多，求期末自习攻略"
            @keyup.enter="runDraft"
          />
          <el-button type="primary" :loading="drafting" @click="runDraft">
            {{ drafting ? '起草中…' : 'AI 起草' }}
          </el-button>
        </div>

        <div v-if="drafting" class="draft-loading">
          <AiThinking
            title="AI 正在读你的描述"
            subtitle="提取主题 · 匹配分类 · 组织正文"
            :steps="DRAFT_STEPS"
          />
        </div>

        <div v-else-if="draftSimilar.length" class="similar-list">
          <div class="similar-list__head">
            <span class="strong">AI 找到 {{ draftSimilar.length }} 条相似帖</span>
            <span class="t-xs faint">发布前先看看，避免重复提问</span>
          </div>
          <div
            v-for="item in draftSimilar"
            :key="item.id"
            class="similar-item"
            :class="{ 'is-open': previewSimilarId === item.id }"
          >
            <button type="button" class="similar-item__row" @click="previewSimilar(item)">
              <span class="similar-item__score mono">{{ item.score }}<i>%</i></span>
              <span class="similar-item__main">
                <span class="similar-item__title">{{ item.title }}</span>
                <span class="similar-item__reasons">
                  <span
                    v-for="reason in item.reasons"
                    :key="reason"
                    class="tag-soft tag-soft--brand"
                  >
                    {{ reason }}
                  </span>
                </span>
              </span>
              <span class="similar-item__meta">{{ replyCount(item) }} 回复</span>
            </button>
            <div v-if="previewSimilarId === item.id" class="similar-item__preview">
              <p class="clamp-2">{{ item.content }}</p>
              <span class="t-xs faint">点击标题可收起预览</span>
            </div>
          </div>
        </div>
      </section>

      <el-form
        ref="formRef"
        class="post-form"
        :model="form"
        :rules="rules"
        label-position="top"
        require-asterisk-position="right"
        @submit.prevent
      >
        <el-form-item label="标题" prop="title">
          <el-input
            v-model="form.title"
            maxlength="40"
            show-word-limit
            placeholder="用一句话说清楚你想聊什么"
          />
        </el-form-item>

        <el-form-item label="分类" prop="category">
          <div class="chip-row">
            <button
              v-for="cat in categoryOptions"
              :key="cat.name"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': form.category === cat.name }"
              @click="form.category = cat.name"
            >
              {{ cat.name }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="标签（最多 3 个）" prop="tags">
          <div class="chip-row tag-picker">
            <button
              v-for="tag in tagChoices"
              :key="tag"
              type="button"
              class="chip chip--sm"
              :class="{ 'is-active': form.tags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              #{{ tag }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="正文" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="6"
            maxlength="600"
            show-word-limit
            placeholder="补充时间、地点、具体需求或你的经验，信息越完整越容易被回复。"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-foot">
          <el-button :disabled="forum.posting" @click="createOpen = false">取消</el-button>
          <el-button type="primary" :loading="forum.posting" @click="submitCreate">
            {{ forum.posting ? '发布中…' : '发布帖子' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.forum-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.forum-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.forum-head-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* ---------- 筛选工具栏 ---------- */
.forum-toolbar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--line-strong);
}

.forum-toolbar__cats {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.forum-toolbar__cats .chip-row {
  gap: 8px;
}

.filter-label {
  flex: none;
  padding-top: 4px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-3);
}

.chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 17px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.chip.is-active .chip__count {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.forum-toolbar__row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.forum-search {
  flex: 0 1 300px;
  width: 300px;
}

.sort-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.unresolved-chip {
  margin-left: auto;
}

.forum-toolbar__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.forum-toolbar__hint {
  color: var(--text-4);
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--brand-600);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

/* ---------- 帖子卡片 ---------- */
.forum-feed {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.forum-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--line);
}

.post-card {
  padding: 24px 8px 24px 0;
  border-bottom: 1px solid var(--line);
}

.post-card::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 24px;
  bottom: 24px;
  width: 2px;
  border-radius: 0;
  background: var(--brand-500);
  opacity: 0;
}

.post-card__top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  box-shadow: var(--shadow-xs);
}

.post-card__who {
  flex: 1;
  min-width: 0;
}

.post-card__name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-1);
}

.role-chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  flex: none;
}

.role-chip--staff {
  background: var(--brand-50);
  color: var(--brand-700);
}

.post-card__sub {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.dot-sep {
  color: var(--text-4);
}

.post-card__flags {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex: none;
  max-width: 48%;
  flex-wrap: wrap;
}

.post-card__title {
  margin: 12px 0 0;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--text-1);
  transition: color var(--dur) var(--ease-out);
}

.post-card:hover .post-card__title {
  color: var(--brand-600);
}

.post-card__desc {
  margin: 4px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.75;
  color: var(--text-2);
}

.post-card__tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.post-card__foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  padding: 0;
  color: var(--text-3);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  transition: color var(--dur) var(--ease-out);
}

.like-btn__heart {
  font-size: 14px;
  line-height: 1;
}

.like-btn:hover,
.like-btn.is-liked {
  color: var(--coral-600);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.post-card__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 600;
}

.forum-empty {
  padding: 8px;
}

/* ---------- 右侧栏 ---------- */
.forum-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  align-self: start;
}

.hot-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.hot-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.hot-row__rank {
  flex: none;
  width: 20px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-4);
  line-height: 1.5;
}

.hot-row__rank.is-top {
  color: var(--brand-600);
}

.hot-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hot-row__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
  transition: color var(--dur) var(--ease-out);
}

.hot-row:hover .hot-row__title {
  color: var(--brand-600);
}

.hot-row__meta {
  font-size: 12px;
  color: var(--text-3);
}

.hot-row__arrow {
  flex: none;
  margin-top: 0px;
  font-size: 12px;
  color: var(--text-4);
}

.help-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.help-row:last-of-type {
  border-bottom: none;
}

.help-row__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
  transition: color var(--dur) var(--ease-out);
}

.help-row:hover .help-row__title {
  color: var(--brand-600);
}

.help-row__meta {
  font-size: 12px;
  color: var(--text-3);
}

.help-more {
  margin-top: 12px;
}

/* AI 引导卡 */
.ai-guide {
  position: relative;
  overflow: hidden;
  padding: 16px;
  border-color: var(--brand-100);
  background: var(--brand-50);
}


.ai-guide__head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.ai-guide__orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--brand-600);
  color: #fff;
  font-size: 18px;
  box-shadow: none;
}

.ai-guide__headtext {
  flex: 1;
  min-width: 0;
}

.ai-guide__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
  color: var(--text-1);
}

.ai-guide__desc {
  margin: 4px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.55;
  color: var(--text-2);
}

.ai-guide__composer {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 4px 4px 4px 12px;
  border: 1px solid var(--brand-100);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}

.ai-guide__composer:focus-within {
  border-color: var(--brand-300);
  box-shadow: 0 0 0 3px var(--brand-50);
}

.ai-guide__input {
  flex: 1;
  min-width: 0;
}

.ai-guide__input :deep(.el-input__wrapper) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.ai-guide__input :deep(.el-input__inner) {
  height: 30px;
  font-size: var(--fs-xs);
  color: var(--text-1);
}

.ai-guide__input :deep(.el-input__inner::placeholder) {
  color: var(--text-2);
}

.ai-guide__btn {
  flex: none;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  box-shadow: none;
}

.ai-guide__btn :deep(.el-icon) {
  font-size: 13px;
}

.ai-guide__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.ai-guide__list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--fs-xs);
  line-height: 1.55;
  color: var(--text-2);
}

.ai-guide__list li .el-icon {
  flex: none;
  margin-top: 0px;
  color: var(--brand-600);
  font-size: 13px;
}

.ai-guide__note {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 12px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--brand-200);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.ai-guide__note .el-icon {
  flex: none;
  color: var(--teal-600);
  font-size: 12px;
}

/* 公约 */
.rules-card :deep(.sec__head) {
  margin-bottom: 12px;
}

.rules-card :deep(.sec__desc) {
  margin-top: 4px;
  color: var(--text-2);
}

.rule-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rule-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
}

.rule-list li:first-child {
  padding-top: 0;
}

.rule-list li:last-child {
  padding-bottom: 0;
}

.rule-list li + li {
  border-top: 1px solid var(--line);
}

.rule-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 0px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 700;
}

.rule-list b {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.45;
  color: var(--text-1);
}

.rule-list p {
  margin: 0px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-2);
  text-wrap: pretty;
}

.rule-foot {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--teal-50);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
  text-wrap: pretty;
}

.rule-foot .el-icon {
  flex: none;
  margin-top: 0px;
  color: var(--teal-600);
  font-size: 13px;
}

/* ---------- 发帖弹层 ---------- */
.pub-head h3 {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  letter-spacing: 0;
  color: var(--text-1);
}

.pub-head p {
  margin: 4px 0 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.forum-notice {
  align-items: flex-start;
  margin-bottom: 12px;
}

.forum-notice p {
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

.notice-close {
  flex: none;
  border: none;
  background: none;
  padding: 0 0px;
  color: var(--text-3);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.draft-panel {
  padding: 16px 16px;
  border: 1px solid var(--brand-100);
  border-radius: var(--radius);
  background: var(--brand-50);
}

.draft-panel__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.draft-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  background: var(--brand-500);
  color: #fff;
  font-size: 18px;
}

.draft-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-1);
}

.draft-panel__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

.draft-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.draft-panel__row :deep(.el-input) {
  flex: 1;
}

.draft-loading {
  margin-top: 12px;
}

.draft-loading :deep(.think) {
  padding: 8px 4px 4px;
}

.similar-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--brand-200);
}

.similar-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: var(--fs-xs);
}

.similar-item.is-open {
  background: rgba(255, 255, 255, 0.55);
  border-radius: var(--radius);
}

.similar-item__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.similar-item + .similar-item .similar-item__row {
  border-top: 1px solid var(--line);
}

.similar-item__score {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0px;
  width: 42px;
  height: 42px;
  flex: none;
  padding-top: 12px;
  border: 1px solid var(--brand-200);
  border-radius: 50%;
  background: var(--surface);
  color: var(--brand-600);
  font-size: 13px;
  font-weight: 700;
}

.similar-item__score i {
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  color: var(--text-3);
}

.similar-item__main {
  flex: 1;
  min-width: 0;
}

.similar-item__title {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
}

.similar-item__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.similar-item__reasons .tag-soft {
  height: 19px;
  padding: 0 8px;
  font-size: 12px;
}

.similar-item__meta {
  flex: none;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.similar-item__preview {
  margin: 0 0 8px 48px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.similar-item__preview p {
  margin: 0 0 4px;
}

.post-form {
  margin-top: 16px;
}

.post-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.post-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.tag-picker {
  gap: 8px;
}

.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-foot :deep(.el-button + .el-button) {
  margin-left: 0;
}

:global(.forum-dialog) {
  max-width: calc(100vw - 28px);
  border-radius: var(--radius-xl);
}

:global(.forum-dialog .el-dialog__header) {
  padding-bottom: 4px;
}

:global(.forum-dialog .el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
  padding-top: 12px;
}

/* ---------- 响应式 ---------- */
@media (min-width: 1181px) {
  .forum-side > * {
    flex: none;
  }

  .forum-side {
    position: sticky;
    top: 90px;
    max-height: calc(100vh - 112px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .forum-side::-webkit-scrollbar {
    width: 5px;
  }

  .forum-side::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--line-strong);
  }
}

@media (max-width: 1180px) {
  .forum-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

@media (max-width: 900px) {
  .forum-side {
    display: flex;
    flex-direction: column;
  }

  .forum-search {
    flex: 1 1 100%;
    width: 100%;
  }

  .unresolved-chip {
    margin-left: 0;
  }
}

@media (max-width: 640px) {
  .forum-page {
    gap: 16px;
  }

  .ai-guide {
    padding: 16px;
  }

  .forum-head-actions {
    width: 100%;
  }

  .forum-head-actions :deep(.el-button) {
    flex: 1;
  }

  .forum-toolbar {
    padding: 12px;
  }

  .forum-toolbar__cats {
    flex-direction: column;
    gap: 8px;
  }

  .filter-label {
    padding-top: 0;
  }

  .forum-toolbar__row {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }

  .forum-search {
    flex: none;
    width: 100%;
  }

  .sort-group {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .unresolved-chip {
    align-self: flex-start;
  }

  .forum-toolbar__foot {
    flex-wrap: wrap;
  }

  .forum-toolbar__hint {
    display: none;
  }

  .post-card {
    padding: 16px 16px 12px 16px;
  }

  .post-card__top {
    flex-wrap: wrap;
  }

  .post-card__who {
    flex: 1 1 calc(100% - 49px);
  }

  .post-card__flags {
    width: 100%;
    max-width: none;
    justify-content: flex-start;
    padding-left: 48px;
  }

  .post-card__title {
    font-size: 14px;
  }

  .post-card__foot {
    flex-wrap: wrap;
    gap: 12px;
  }

  .post-card__more {
    margin-left: auto;
  }

  .forum-empty :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .forum-empty :deep(.el-button + .el-button) {
    margin-top: 4px;
  }

  .draft-panel {
    padding: 12px;
  }

  .draft-panel__row {
    flex-direction: column;
    align-items: stretch;
  }

  .draft-panel__row :deep(.el-button) {
    width: 100%;
  }

  .similar-item__preview {
    margin-left: 0;
  }

  .similar-item__meta {
    display: none;
  }

  .dialog-foot {
    width: 100%;
  }

  .dialog-foot :deep(.el-button) {
    flex: 1;
  }

  :global(.forum-dialog .el-dialog__body) {
    max-height: 74vh;
  }
}
</style>
