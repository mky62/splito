import type { ExtractResponse, SetPeopleRequest, SplitResponse } from '../types/api'

const DEFAULT_REMOTE_API_BASE = 'https://splito-3ghi.onrender.com'

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')

const resolveDevApiBaseUrl = () => {
  const host = window.location.hostname || 'localhost'
  return `http://${host}:8000`
}

const resolveApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE?.trim()

  if (envUrl) {
    return trimTrailingSlash(envUrl)
  }

  if (import.meta.env.DEV) {
    return resolveDevApiBaseUrl()
  }

  return DEFAULT_REMOTE_API_BASE
}

const API_BASE = resolveApiBaseUrl()

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || `HTTP error ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function fetchWithNetworkHint(path: string, init?: RequestInit) {
  try {
    return await fetch(`${API_BASE}${path}`, init)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network request failed'

    if (message.includes('Failed to fetch')) {
      throw new Error(
        `Cannot connect to backend at ${API_BASE}. Check the server status or set VITE_API_BASE.`,
      )
    }

    throw error
  }
}

export async function extractBill(file: File): Promise<ExtractResponse> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 120000)

  try {
    const response = await fetchWithNetworkHint('/extract-bill', {
      body: formData,
      method: 'POST',
      signal: controller.signal,
    })

    return handleResponse<ExtractResponse>(response)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. OCR processing took too long.')
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function setExpectedPeople(
  billId: string,
  data: SetPeopleRequest,
): Promise<void> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/set-people`, {
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })

  await handleResponse<void>(response)
}

export async function getSplitResults(billId: string): Promise<SplitResponse> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/split`)
  return handleResponse<SplitResponse>(response)
}

export function getApiBaseUrl() {
  return API_BASE
}
