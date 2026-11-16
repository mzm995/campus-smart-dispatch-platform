import { apiRequest } from './api'

export async function parseRequirementCloud(text) {
  return apiRequest('/ai/parse', {
    method: 'POST',
    body: { text },
    timeoutMs: 65_000,
  })
}

export async function generateWithCloud(task, payload) {
  return apiRequest('/ai/generate', {
    method: 'POST',
    body: { task, payload },
    timeoutMs: 65_000,
  })
}

export async function saveDeepSeekKey(apiKey) {
  return apiRequest('/system/ai-provider', {
    method: 'PATCH',
    body: { apiKey, enabled: true },
    timeoutMs: 15_000,
  })
}

export async function testDeepSeekConnection() {
  return apiRequest('/system/ai-provider/test', {
    method: 'POST',
    timeoutMs: 65_000,
  })
}
