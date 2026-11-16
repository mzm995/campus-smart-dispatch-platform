<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ChatDotRound,
  CircleCheck,
  Delete,
  InfoFilled,
  MagicStick,
  View,
} from '@element-plus/icons-vue'
import SectionCard from '@/components/SectionCard.vue'
import StatusPill from '@/components/StatusPill.vue'
import EmptyState from '@/components/EmptyState.vue'
import AiBadge from '@/components/AiBadge.vue'
import AiThinking from '@/components/AiThinking.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useForumStore } from '@/stores/forum'
import { useUserStore } from '@/stores/user'
import { generateWithCloud } from '@/utils/aiCloud'
import { fmtDateTime, timeAgo } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const forum = useForumStore()
const user = useUserStore()

const currentUserName = computed(() => user.user?.name || '林小满')
const post = computed(() => forum.getById(String(route.params.id || '')))

const SUMMARY_STEPS = ['通读全部回复', '提取共识与结论', '生成速读摘要']

const aiLoading = ref(true)
const summary = ref(null)
const replySort = ref('latest')
const replyContent = ref('')
const replyInputRef = ref(null)
const replyListRef = ref(null)
const editorRef = ref(null)

const isPostAuthor = computed(
  () => Boolean(post.value) && post.value.author === currentUserName.value,
)
const canModerateForum = computed(
  () => user.can('forum.moderate') || user.can('forum.delete.any'),
)
const canManagePost = computed(() => Boolean(post.value) && (isPostAuthor.value || canModerateForum.value))
const postLiked = computed(
  () => Boolean(post.value?.likedBy?.includes(currentUserName.value)),
)

const sortedReplies = computed(() => {
  const list = [...(post.value?.replies || [])]
  if (replySort.value === 'hot') {
    return list.sort(
      (a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt),
    )
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const similarPosts = computed(() => (post.value ? forum.similarTo(post.value) : []))

function isStaff(role) {
  return ['管理员', '高级管理员', '论坛坛主', '论坛版主'].includes(role)
}

function staffTone(role) {
  return role === '管理员' ? 'coral' : 'brand'
}

function ringStyle(item) {
  return {
    background: `conic-gradient(var(--brand-500) 0 ${item.score}%, var(--brand-100) ${item.score}% 100%)`,
  }
}

function backToList() {
  router.push('/forum')
}

function openPost(item) {
  router.push(`/forum/${item.id}`)
}

function goBoard(name) {
  forum.resetFilters()
  forum.category = name
  router.push('/forum')
}

function focusEditor() {
  replyInputRef.value?.focus()
  editorRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function toggleSolved() {
  if (!post.value) return
  const next = !post.value.solved
  if (!forum.markSolved(post.value.id, next)) {
    ElMessage.warning('只有作者、论坛坛主或管理员可以变更帖子状态')
    return
  }
  ElMessage.success(next ? '已标记为已解决，感谢你的反馈' : '已恢复为讨论中')
}

async function deletePost() {
  const target = post.value
  if (!target) return
  try {
    await ElMessageBox.confirm('删除后，帖子与全部回复都会消失，且无法恢复。', '删除这篇帖子？', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '再想想',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  if (!forum.remove(target.id)) {
    ElMessage.warning('只有作者、论坛坛主或管理员可以删除帖子')
    return
  }
  ElMessage.success('帖子已删除')
  router.push('/forum')
}

async function loadSummary() {
  const target = post.value
  if (!target) return
  aiLoading.value = true
  summary.value = null
  if (String(route.params.id || '') !== target.id) return
  try {
    const response = await generateWithCloud('forum_summary', {
      title: target.title,
      content: target.content,
      solved: target.solved,
      replies: (target.replies || []).slice(0, 20).map((reply) => ({
        author: reply.author,
        role: reply.authorRole,
        content: reply.content,
        likes: reply.likes,
      })),
    })
    summary.value = {
      count: (target.replies || []).length,
      text: String(response.result || '').trim(),
      solved: Boolean(target.solved),
      engine: response.engine,
    }
  } catch (error) {
    summary.value = forum.aiSummary(target)
    summary.value.fallbackReason = error?.message || String(error)
  }
  aiLoading.value = false
}

async function submitReply() {
  const target = post.value
  if (!target || forum.replying) return
  const content = replyContent.value.trim()
  if (!content) {
    ElMessage.warning('先写点什么再发布吧')
    replyInputRef.value?.focus()
    return
  }
  await forum.reply(target.id, content)
  replyContent.value = ''
  replySort.value = 'latest'
  await loadSummary()
  ElMessage.success('回复已发布，感谢你的回应')
  await nextTick()
  replyListRef.value?.firstElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function resetDetailState() {
  replyContent.value = ''
  replySort.value = 'latest'
}

onMounted(() => {
  if (post.value) {
    forum.touchView(post.value.id)
    loadSummary()
  } else {
    aiLoading.value = false
  }
})

watch(
  () => route.params.id,
  () => {
    resetDetailState()
    if (post.value) {
      forum.touchView(post.value.id)
      loadSummary()
    } else {
      aiLoading.value = false
      summary.value = null
    }
  },
)
</script>

<template>
  <div v-if="post" class="page forum-detail">
    <div class="detail-top">
      <button type="button" class="back-link" @click="backToList">
        <el-icon><ArrowLeft /></el-icon>返回论坛
      </button>
      <nav class="crumbs" aria-label="面包屑">
        <button type="button" @click="backToList">校园论坛</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">帖子详情</span>
      </nav>
    </div>

    <div class="grid g-7-5 detail-main">
      <div class="detail-feed">
        <article class="card post-main">
          <div class="post-main__flags">
            <span class="tag-soft tag-soft--brand">{{ post.category }}</span>
            <StatusPill v-if="post.solved" status="resolved" text="已解决" />
            <StatusPill v-else status="ongoing" text="讨论中" />
            <AiBadge v-if="post.aiGenerated" ghost small />
          </div>

          <h1 class="post-main__title">{{ post.title }}</h1>

          <div class="post-main__author">
            <UserAvatar
              class="avatar avatar--lg"
              :name="post.author"
              :user-id="post.authorId"
              :src="post.avatarUrl"
              :size="44"
            />
            <div class="post-main__who">
              <div class="post-main__name">
                {{ post.author }}
                <span class="role-chip" :class="{ 'role-chip--staff': isStaff(post.authorRole) }">
                  {{ post.authorRole }}
                </span>
              </div>
              <div class="post-main__sub">
                <span :title="fmtDateTime(post.createdAt)">{{ timeAgo(post.createdAt) }}</span>
                <span class="dot-sep">·</span>
                <span><el-icon><View /></el-icon>{{ post.views }} 次浏览</span>
              </div>
            </div>
          </div>

          <p class="post-main__content">{{ post.content }}</p>

          <div v-if="post.tags?.length" class="post-main__tags">
            <span v-for="tag in post.tags" :key="tag" class="tag-soft">#{{ tag }}</span>
          </div>

          <div class="post-main__actions">
            <button
              type="button"
              class="like-btn"
              :class="{ 'is-liked': postLiked }"
              :aria-label="postLiked ? '取消点赞' : '点赞'"
              @click="forum.toggleLike(post.id)"
            >
              <span class="like-btn__heart">{{ postLiked ? '♥' : '♡' }}</span>
              {{ post.likes }} 人觉得有用
            </button>

            <div v-if="canManagePost" class="author-actions">
              <el-button plain :icon="CircleCheck" @click="toggleSolved">
                {{ post.solved ? '取消已解决' : '标记已解决' }}
              </el-button>
              <el-button type="danger" plain :icon="Delete" @click="deletePost">删除帖子</el-button>
            </div>
          </div>
        </article>

        <div class="card ai-summary">
          <span class="ai-summary__glow" aria-hidden="true"></span>
          <div class="ai-summary__head">
            <span class="ai-summary__orb"><el-icon><MagicStick /></el-icon></span>
            <div class="grow">
              <div class="ai-summary__title">
                AI 速读
                <AiBadge small text="AI 摘要" />
              </div>
              <p class="ai-summary__desc">一分钟读完这篇讨论的来龙去脉。</p>
            </div>
          </div>

          <div v-if="aiLoading" class="ai-summary__loading">
            <AiThinking
              title="AI 正在读这篇讨论"
              subtitle="通读回复 · 提炼结论 · 生成摘要"
              :steps="SUMMARY_STEPS"
            />
          </div>

          <div v-else-if="summary" class="ai-summary__body">
            <div class="ai-summary__meta">
              <span class="strong">{{ summary.count }} 条回复</span>
              <span class="dot-sep">·</span>
              <span :class="summary.solved ? 'summary-ok' : 'summary-live'">
                {{ summary.solved ? '已解决' : '讨论中' }}
              </span>
            </div>
            <p class="ai-summary__text">{{ summary.text }}</p>
            <button
              v-if="!summary.count"
              type="button"
              class="link-btn ai-summary__cta"
              @click="focusEditor"
            >
              还没有人回复，来抢沙发 →
            </button>
          </div>
        </div>

        <div class="card reply-card">
          <div class="reply-head">
            <h2>
              全部回复
              <span class="mono">{{ post.replies?.length || 0 }}</span>
            </h2>
            <div class="reply-sort">
              <button
                type="button"
                class="chip chip--sm"
                :class="{ 'is-active': replySort === 'latest' }"
                @click="replySort = 'latest'"
              >
                最新
              </button>
              <button
                type="button"
                class="chip chip--sm"
                :class="{ 'is-active': replySort === 'hot' }"
                @click="replySort = 'hot'"
              >
                最热
              </button>
            </div>
          </div>

          <div v-if="sortedReplies.length" ref="replyListRef" class="reply-list">
            <div v-for="reply in sortedReplies" :key="reply.id" class="reply-item">
              <UserAvatar
                class="avatar avatar--sm"
                :name="reply.author"
                :user-id="reply.authorId"
                :src="reply.avatarUrl"
                :size="36"
              />
              <div class="reply-body">
                <div class="reply-top">
                  <span class="reply-author">{{ reply.author }}</span>
                  <StatusPill
                    v-if="isStaff(reply.authorRole)"
                    status="staff"
                    :text="reply.authorRole"
                    :tone="staffTone(reply.authorRole)"
                    :dot="false"
                  />
                  <span v-else class="role-chip">{{ reply.authorRole }}</span>
                  <AiBadge v-if="reply.aiGenerated" ghost small text="AI 回复" />
                  <span class="reply-time" :title="fmtDateTime(reply.createdAt)">
                    {{ timeAgo(reply.createdAt) }}
                  </span>
                </div>
                <p class="reply-content">{{ reply.content }}</p>
                <div class="reply-foot">
                  <button
                    type="button"
                    class="reply-like"
                    :class="{ 'is-liked': reply.liked }"
                    :aria-label="reply.liked ? '取消点赞' : '点赞这条回复'"
                    @click="forum.likeReply(post.id, reply.id)"
                  >
                    <span class="like-btn__heart">{{ reply.liked ? '♥' : '♡' }}</span>
                    {{ reply.likes || 0 }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="reply-empty">
            <EmptyState
              compact
              title="还没有回复，来抢个沙发"
              desc="你的经验可能正好帮到这位同学，说两句吧。"
            >
              <el-button type="primary" plain @click="focusEditor">写下第一条回复</el-button>
            </EmptyState>
          </div>

          <div ref="editorRef" class="reply-editor">
            <div class="editor-head">
              <span class="editor-title">写下你的回复</span>
              <span class="editor-hint">友善讨论，AI 会帮你留意措辞</span>
            </div>
            <el-input
              ref="replyInputRef"
              v-model="replyContent"
              type="textarea"
              :rows="4"
              maxlength="300"
              show-word-limit
              :disabled="forum.replying"
              placeholder="分享你的经验，或者补充一条有用的信息…"
            />
            <div class="editor-foot">
              <span class="editor-note">
                <el-icon><InfoFilled /></el-icon>
                回复会公开显示，请勿留下手机号等隐私信息
              </span>
              <el-button type="primary" :loading="forum.replying" @click="submitReply">
                {{ forum.replying ? '发布中…' : '发布回复' }}
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <aside class="detail-side">
        <SectionCard title="相似讨论" desc="AI 从论坛里找到的同频帖子">
          <template #actions>
            <span class="tag-soft tag-soft--brand">{{ similarPosts.length }}</span>
          </template>
          <template v-if="similarPosts.length">
            <button
              v-for="item in similarPosts"
              :key="item.id"
              type="button"
              class="similar-row"
              @click="openPost(item)"
            >
              <span class="score-ring" :style="ringStyle(item)">
                <span class="score-ring__inner mono">{{ item.score }}%</span>
              </span>
              <span class="similar-main">
                <span class="similar-title clamp-2">{{ item.title }}</span>
                <span class="similar-reasons">
                  <span v-for="reason in item.reasons" :key="reason" class="tag-soft tag-soft--brand">
                    {{ reason }}
                  </span>
                </span>
                <span class="similar-meta">{{ item.category }} · {{ item.replies?.length || 0 }} 回复</span>
              </span>
            </button>
          </template>
          <EmptyState
            v-else
            compact
            title="暂时没有相似讨论"
            desc="这篇帖子的话题还比较新鲜，过一会儿再来看看。"
          />
        </SectionCard>

        <SectionCard title="板块导航" desc="逛逛其他话题">
          <button
            v-for="cat in forum.categories"
            :key="cat.name"
            type="button"
            class="board-row"
            :class="{ 'is-active': post.category === cat.name }"
            @click="goBoard(cat.name)"
          >
            <span class="board-dot"></span>
            <span class="grow">{{ cat.name }}</span>
            <span class="board-count mono">{{ cat.count }}</span>
          </button>
        </SectionCard>

        <SectionCard title="论坛小贴士" desc="让讨论更顺畅的几个小习惯">
          <ul class="tip-list">
            <li class="tip">
              <span class="tip__no mono">01</span>
              <div>
                <b>提问带上时间地点</b>
                <p>比如「周三下午 A栋三楼」，越具体越容易被解决。</p>
              </div>
            </li>
            <li class="tip">
              <span class="tip__no mono">02</span>
              <div>
                <b>先看 AI 速读</b>
                <p>回复前花十秒读摘要，避免重复回答已经解决的问题。</p>
              </div>
            </li>
            <li class="tip">
              <span class="tip__no mono">03</span>
              <div>
                <b>发布前核对 AI 草稿</b>
                <p>AI 只负责组织语言，事实和隐私信息请自己再检查一遍。</p>
              </div>
            </li>
          </ul>
          <div class="tip-foot">
            <el-icon><InfoFilled /></el-icon>
            <span>管理员与论坛坛主会定期整理优质讨论。</span>
          </div>
        </SectionCard>
      </aside>
    </div>
  </div>

  <div v-else class="page forum-detail">
    <div class="detail-top">
      <button type="button" class="back-link" @click="backToList">
        <el-icon><ArrowLeft /></el-icon>返回论坛
      </button>
      <nav class="crumbs" aria-label="面包屑">
        <button type="button" @click="backToList">校园论坛</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">帖子详情</span>
      </nav>
    </div>
    <div class="card detail-invalid">
      <EmptyState
        title="帖子不存在或已被删除"
        desc="可能是链接过期，或者作者已经删除了这篇帖子。回论坛看看其他讨论吧。"
      >
        <el-button type="primary" :icon="ChatDotRound" @click="backToList">返回论坛</el-button>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 顶部导航 ---------- */
.detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: none;
  padding: 0;
  color: var(--brand-600);
  font-size: var(--fs-sm);
  font-weight: 650;
  cursor: pointer;
  transition: color var(--dur) var(--ease-out);
}

.back-link:hover {
  color: var(--brand-700);
  text-decoration: underline;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.crumbs button {
  border: none;
  background: none;
  padding: 0;
  color: var(--text-3);
  font-size: inherit;
  cursor: pointer;
}

.crumbs button:hover {
  color: var(--brand-600);
}

.crumb-current {
  color: var(--text-2);
  font-weight: 600;
}

/* ---------- 主帖 ---------- */
.detail-feed {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.post-main {
  overflow: hidden;
  padding: 26px 28px 20px;
}

.post-main::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--brand-500), var(--teal-500), var(--amber-500));
}

.post-main__flags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.post-main__title {
  margin: 13px 0 0;
  font-size: clamp(21px, 2.4vw, 28px);
  font-weight: 760;
  line-height: 1.38;
  letter-spacing: -0.02em;
  color: var(--text-1);
}

.post-main__author {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 17px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--line);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  box-shadow: var(--shadow-xs);
}

.avatar--lg {
  width: 44px;
  height: 44px;
  font-size: 15px;
}

.avatar--sm {
  width: 36px;
  height: 36px;
  font-size: 13px;
}

.post-main__who {
  flex: 1;
  min-width: 0;
}

.post-main__name {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: var(--fs-base);
  font-weight: 680;
  color: var(--text-1);
}

.role-chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 600;
  flex: none;
}

.role-chip--staff {
  background: var(--brand-50);
  color: var(--brand-700);
}

.post-main__sub {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-3);
}

.post-main__sub span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dot-sep {
  color: var(--text-4);
}

.post-main__content {
  margin: 18px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--fs-md);
  line-height: 1.95;
  color: var(--text-2);
}

.post-main__tags {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.post-main__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--dur) var(--ease-out),
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}

.like-btn__heart {
  font-size: 15px;
  line-height: 1;
}

.like-btn:hover {
  border-color: var(--coral-100);
  color: var(--coral-600);
}

.like-btn.is-liked {
  border-color: var(--coral-100);
  background: var(--coral-50);
  color: var(--coral-600);
}

.author-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.author-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* ---------- AI 速读 ---------- */
.ai-summary {
  position: relative;
  overflow: hidden;
  padding: 20px 22px;
  border-color: var(--brand-100);
  background: linear-gradient(135deg, var(--brand-50), var(--surface) 70%);
}

.ai-summary__glow {
  position: absolute;
  top: -70px;
  right: -60px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(18, 179, 166, 0.16), transparent 68%);
  pointer-events: none;
}

.ai-summary__head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.ai-summary__orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--brand-500), var(--teal-500));
  color: #fff;
  font-size: 17px;
  box-shadow: 0 8px 18px -10px rgba(108, 99, 255, 0.9);
}

.ai-summary__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-1);
}

.ai-summary__desc {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.ai-summary__loading {
  margin-top: 12px;
}

.ai-summary__loading :deep(.think) {
  padding: 6px 2px 2px;
}

.ai-summary__body {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px dashed var(--brand-200);
}

.ai-summary__meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: var(--fs-xs);
  color: var(--text-2);
}

.summary-ok {
  color: var(--teal-600);
  font-weight: 650;
}

.summary-live {
  color: var(--amber-600);
  font-weight: 650;
}

.ai-summary__text {
  margin: 7px 0 0;
  white-space: pre-wrap;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--text-2);
}

.ai-summary__cta {
  margin-top: 9px;
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

/* ---------- 回复区 ---------- */
.reply-card {
  padding: 20px 22px;
}

.reply-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.reply-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 720;
  letter-spacing: -0.01em;
  color: var(--text-1);
}

.reply-head h2 .mono {
  margin-left: 3px;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-3);
}

.reply-sort {
  display: flex;
  align-items: center;
  gap: 7px;
}

.reply-list {
  margin-top: 6px;
}

.reply-item {
  display: flex;
  gap: 11px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--line);
}

.reply-item:last-child {
  border-bottom: none;
  padding-bottom: 6px;
}

.reply-body {
  flex: 1;
  min-width: 0;
}

.reply-top {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.reply-author {
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--text-1);
}

.reply-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4);
}

.reply-content {
  margin: 7px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--text-2);
}

.reply-foot {
  margin-top: 7px;
}

.reply-like {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  padding: 0;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--dur) var(--ease-out);
}

.reply-like .like-btn__heart {
  font-size: 13px;
}

.reply-like:hover,
.reply-like.is-liked {
  color: var(--coral-600);
}

.reply-empty {
  padding: 4px 0 2px;
}

.reply-editor {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.editor-title {
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--text-1);
}

.editor-hint {
  font-size: 11px;
  color: var(--text-4);
}

.editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.editor-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-3);
}

.editor-note .el-icon {
  color: var(--teal-600);
}

/* ---------- 右侧栏 ---------- */
.detail-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  align-self: start;
}

.similar-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  border: none;
  border-bottom: 1px dashed var(--line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.similar-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.score-ring {
  display: inline-flex;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 2px;
  border-radius: 50%;
}

.score-ring__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--surface);
  color: var(--brand-600);
  font-size: 9.5px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.similar-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.similar-title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-1);
  transition: color var(--dur) var(--ease-out);
}

.similar-row:hover .similar-title {
  color: var(--brand-600);
}

.similar-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.similar-reasons .tag-soft {
  height: 18px;
  padding: 0 6px;
  font-size: 9.5px;
}

.similar-meta {
  font-size: 10.5px;
  color: var(--text-3);
}

.board-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 9px;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--text-2);
  font-size: var(--fs-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out);
}

.board-row:hover {
  background: var(--surface-3);
}

.board-row.is-active {
  background: var(--brand-50);
  color: var(--brand-700);
  font-weight: 650;
}

.board-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-400, var(--brand-500));
  opacity: 0.65;
}

.board-row.is-active .board-dot {
  opacity: 1;
  background: var(--brand-600);
}

.board-count {
  flex: none;
  font-size: 11px;
  color: var(--text-3);
}

.board-row.is-active .board-count {
  color: var(--brand-600);
}

/* 小贴士 */
.tip-list {
  display: flex;
  flex-direction: column;
  gap: 13px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.tip__no {
  flex: none;
  padding-top: 1px;
  font-size: 11px;
  font-weight: 700;
  color: var(--brand-500);
}

.tip b {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--text-1);
}

.tip p {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-3);
}

.tip-foot {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-3);
}

.tip-foot .el-icon {
  flex: none;
  margin-top: 2px;
  color: var(--teal-600);
}

/* ---------- 空帖 ---------- */
.detail-invalid {
  max-width: 620px;
  margin: 6px auto 0;
  padding: 12px;
}

/* ---------- 响应式 ---------- */
@media (min-width: 1181px) {
  .detail-side {
    position: sticky;
    top: 90px;
    max-height: calc(100vh - 112px);
    overflow-y: auto;
    padding-right: 3px;
  }

  .detail-side::-webkit-scrollbar {
    width: 5px;
  }

  .detail-side::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--line-strong);
  }
}

@media (max-width: 1180px) {
  .detail-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

@media (max-width: 900px) {
  .detail-side {
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .forum-detail {
    gap: 16px;
  }

  .post-main {
    padding: 19px 16px 16px;
  }

  .post-main__title {
    font-size: 20px;
  }

  .post-main__content {
    font-size: 13.5px;
    line-height: 1.85;
  }

  .post-main__actions {
    align-items: stretch;
  }

  .author-actions {
    width: 100%;
    margin-left: 0;
  }

  .author-actions :deep(.el-button) {
    flex: 1;
  }

  .ai-summary {
    padding: 16px;
  }

  .reply-card {
    padding: 16px;
  }

  .reply-time {
    width: 100%;
    margin-left: 0;
  }

  .reply-item {
    gap: 9px;
  }

  .editor-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .editor-foot :deep(.el-button) {
    width: 100%;
  }

  .detail-invalid {
    padding: 8px;
  }
}
</style>
