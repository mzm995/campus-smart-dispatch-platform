import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { aiRecordData } from '@/mock/seed'
import { apiRequest } from '@/utils/api'

export const useAiRecordStore = defineStore('aiRecord', () => {
  const data = ref(aiRecordData)
  const activeRound = ref(2)
  const activePrompt = ref(aiRecordData.prompts[0]?.id || '')
  const usageRecords = ref([])
  const usageScope = ref('own')
  const usageLoading = ref(false)
  const usageError = ref('')
  let usageRequestSeq = 0

  const rounds = computed(() => data.value.iterations)
  const currentRound = computed(() => rounds.value.find((r) => r.round === activeRound.value) || rounds.value[rounds.value.length - 1])
  const prompts = computed(() => data.value.prompts)
  const currentPrompt = computed(() => prompts.value.find((p) => p.id === activePrompt.value) || prompts.value[0])
  const modelCallCount = computed(() =>
    usageRecords.value.filter((record) => /deepseek/i.test(record.model || '')).length,
  )
  const tools = computed(() =>
    data.value.tools.map((tool) =>
      /DeepSeek/i.test(tool.name) ? { ...tool, calls: modelCallCount.value } : tool,
    ),
  )
  const stats = computed(() => {
    const records = usageRecords.value
    const totalCalls = records.length
    const success = records.filter((record) => record.status === 'success').length
    const avgLatencyMs = totalCalls
      ? records.reduce((sum, record) => sum + Number(record.latencyMs || 0), 0) / totalCalls
      : 0
    const tokens = records.reduce(
      (sum, record) => sum + Number(record.usage?.total_tokens || 0),
      0,
    )
    const daily = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (6 - index))
      const next = new Date(date)
      next.setDate(next.getDate() + 1)
      return records.filter((record) => {
        const time = new Date(record.createdAt).getTime()
        return time >= date.getTime() && time < next.getTime()
      }).length
    })
    return {
      totalCalls,
      successRate: totalCalls ? success / totalCalls : 0,
      avgLatency: totalCalls ? `${(avgLatencyMs / 1000).toFixed(1)}s` : '—',
      tokens: totalCalls ? (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)) : '0',
      cost: '¥0.00（演示额度）',
      daily,
    }
  })
  const compliance = computed(() => data.value.compliance)

  async function loadUsage(scope = usageScope.value) {
    const seq = ++usageRequestSeq
    usageLoading.value = true
    usageError.value = ''
    try {
      const payload = await apiRequest(
        `/ai/records?scope=${encodeURIComponent(scope)}&limit=200`,
      )
      if (seq !== usageRequestSeq) return usageRecords.value
      usageScope.value = payload.scope === 'all' ? 'all' : 'own'
      usageRecords.value = Array.isArray(payload.records) ? payload.records : []
      return usageRecords.value
    } catch (error) {
      if (seq === usageRequestSeq) {
        usageError.value = error?.message || 'AI 使用记录加载失败'
      }
      return usageRecords.value
    } finally {
      if (seq === usageRequestSeq) usageLoading.value = false
    }
  }

  const delta = computed(() => {
    const r = currentRound.value
    if (!r) return { accuracy: 0, latency: 0, satisfaction: 0 }
    return {
      accuracy: Math.round((r.after.accuracy - r.before.accuracy) * 100),
      satisfaction: Math.round((r.after.satisfaction - r.before.satisfaction) * 100),
      latency: (parseFloat(r.before.avgLatency) - parseFloat(r.after.avgLatency)).toFixed(1),
    }
  })

  function setRound(n) {
    activeRound.value = n
  }

  function setPrompt(id) {
    activePrompt.value = id
  }

  return {
    data,
    rounds,
    currentRound,
    prompts,
    currentPrompt,
    tools,
    stats,
    compliance,
    delta,
    activeRound,
    activePrompt,
    usageRecords,
    usageScope,
    usageLoading,
    usageError,
    loadUsage,
    setRound,
    setPrompt,
  }
})
