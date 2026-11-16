import { apiAssetUrl, apiUrl, getAuthToken } from './api'

const MAX_EDGE = 1000
const QUALITY = 0.72

export function compressImageFile(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('empty file'))
      return
    }
    // 非图片或浏览器不支持 canvas 时退回原文件。
    if (typeof document === 'undefined' || !file.type?.startsWith('image/')) {
      resolve(file)
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas unavailable')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          quality,
        )
      } catch (err) {
        resolve(file)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export async function uploadImage(file, options) {
  const compressed = await compressImageFile(file, options)
  const token = getAuthToken()
  if (!token) throw new Error('登录状态已失效，请重新登录后上传图片')
  const response = await fetch(apiUrl('/uploads/images'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': compressed.type || 'image/jpeg',
    },
    body: compressed,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error?.message || '图片上传失败')
    error.code = payload?.error?.code || 'IMAGE_UPLOAD_FAILED'
    throw error
  }
  const path = payload.data?.url || ''
  return {
    ...payload.data,
    path,
    url: apiAssetUrl(path),
  }
}

export async function compressImage(file, options) {
  const blob = await compressImageFile(file, options)
  return blobToDataUrl(blob)
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}
