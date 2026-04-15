import type {
  BillData,
  ExtractResponse,
  JoinRequest,
  JoinResponse,
  SelectRequest,
  SelectionsResponse,
  SetPeopleRequest,
  SplitResponse,
  StatusResponse,
} from '../types/api'

const DEFAULT_REMOTE_API_BASE = 'https://splito-3ghi.onrender.com'
const DEFAULT_PUBLIC_SHARE_BASE = 'https://splito-zeta.vercel.app'
const REQUEST_TIMEOUT_MS = 15000

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')

const resolveDevApiBaseUrl = () => ''

const resolvePublicShareBaseUrl = () => {
  const envUrl = import.meta.env.VITE_PUBLIC_SHARE_BASE?.trim()

  if (envUrl) {
    return trimTrailingSlash(envUrl)
  }

  return DEFAULT_PUBLIC_SHARE_BASE
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
const PUBLIC_SHARE_BASE = resolvePublicShareBaseUrl()

function getRequestUrl(path: string) {
  return `${API_BASE}${path}`
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const maybeDetail = 'detail' in payload ? payload.detail : null
    const maybeMessage = 'message' in payload ? payload.message : null

    if (typeof maybeDetail === 'string' && maybeDetail.trim()) {
      return maybeDetail.trim()
    }

    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage.trim()
    }
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return fallback
}

async function parseResponsePayload(response: Response) {
  const raw = await response.text()

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function handleResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = await parseResponsePayload(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallbackMessage))
  }

  return payload as T
}

async function fetchWithNetworkHint(
  path: string,
  init?: RequestInit,
  fallbackMessage = 'Request failed.',
) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(getRequestUrl(path), {
      ...init,
      signal: controller.signal,
    })

    return response
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }

    const message =
      error instanceof Error ? error.message : 'Network request failed'

    if (message.includes('Failed to fetch')) {
      throw new Error(
        `Cannot connect to backend at ${API_BASE || 'the configured dev proxy'}. Check the server status or set VITE_API_BASE.`,
      )
    }

    throw new Error(fallbackMessage)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function extractBill(fileOrFiles: File | File[]): Promise<ExtractResponse> {
  const formData = new FormData()
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]

  if (files.length) {
    formData.append('file', files[0], files[0].name)
  }

  files.forEach((file) => {
    formData.append('files', file, file.name)
  })

  const response = await fetchWithNetworkHint(
    '/extract-bill',
    {
      body: formData,
      method: 'POST',
    },
    'Failed to extract bill.',
  )

  return handleResponse<ExtractResponse>(response, 'Failed to extract bill.')
}

export async function getBillData(billId: string): Promise<BillData> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}`,
    undefined,
    'Failed to load bill.',
  )

  return handleResponse<BillData>(response, 'Failed to load bill.')
}

export async function joinBill(
  billId: string,
  data: JoinRequest,
): Promise<JoinResponse> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/join`,
    {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    'Failed to join bill.',
  )

  return handleResponse<JoinResponse>(response, 'Failed to join bill.')
}

export async function submitSelection(
  billId: string,
  data: SelectRequest,
): Promise<void> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/select`,
    {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    'Failed to submit selection.',
  )

  await handleResponse<{ success: boolean }>(response, 'Failed to submit selection.')
}

export async function getBillStatus(billId: string): Promise<StatusResponse> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/status`,
    undefined,
    'Failed to load bill status.',
  )

  return handleResponse<StatusResponse>(response, 'Failed to load bill status.')
}

export async function getSelections(
  billId: string,
): Promise<SelectionsResponse> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/selections`,
    undefined,
    'Failed to load participants.',
  )

  return handleResponse<SelectionsResponse>(response, 'Failed to load participants.')
}

export async function setExpectedPeople(
  billId: string,
  data: SetPeopleRequest,
): Promise<void> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/set-people`,
    {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    'Failed to generate link.',
  )

  await handleResponse<{ success: boolean }>(response, 'Failed to generate link.')
}

export async function getSplitResults(billId: string): Promise<SplitResponse> {
  const response = await fetchWithNetworkHint(
    `/api/bill/${billId}/split`,
    undefined,
    'Failed to load split.',
  )

  return handleResponse<SplitResponse>(response, 'Failed to load split.')
}

export function getApiBaseUrl() {
  return API_BASE
}

export function getPublicShareBaseUrl() {
  return PUBLIC_SHARE_BASE
}

export function getPublicShareUrl(billId: string) {
  return `${PUBLIC_SHARE_BASE}/bill/${billId}`
}
