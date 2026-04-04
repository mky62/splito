import { NativeModules, Platform } from 'react-native';
import type {
  BillItem,
  ExtractResponse,
  BillData,
  JoinRequest,
  JoinResponse,
  SelectRequest,
  StatusResponse,
  Selection,
  SelectionsResponse,
  SplitResponse,
  SetPeopleRequest,
} from '../types/api';

export type {
  BillItem,
  ExtractResponse,
  BillData,
  JoinRequest,
  JoinResponse,
  SelectRequest,
  StatusResponse,
  Selection,
  SelectionsResponse,
  SplitResponse,
  SetPeopleRequest,
};

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');
const DEFAULT_REMOTE_API_BASE = 'https://splito-3ghi.onrender.com';
const DEFAULT_PUBLIC_SHARE_BASE = 'https://splito-zeta.vercel.app';

const getMetroHost = (): string | null => {
  const sourceCodeModule = NativeModules.SourceCode as
    | { scriptURL?: string }
    | undefined;
  const scriptURL = sourceCodeModule?.scriptURL;
  if (!scriptURL) return null;

  const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?\//i);
  return match?.[1] ?? null;
};

const resolveDevApiBaseUrl = (): string => {
  const metroHost = getMetroHost();
  if (metroHost) {
    return `http://${metroHost}:8000`;
  }

  // Fallbacks when scriptURL is unavailable (very early startup edge cases).
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';
};

const resolveApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE?.trim();
  if (envUrl) return trimTrailingSlash(envUrl);
  if (__DEV__) {
    // Opt into local backend only when explicitly requested.
    if (process.env.EXPO_PUBLIC_USE_LOCAL_API === 'true') {
      return resolveDevApiBaseUrl();
    }
    return DEFAULT_REMOTE_API_BASE;
  }
  return DEFAULT_REMOTE_API_BASE;
};

const API_BASE = resolveApiBaseUrl();
const PUBLIC_SHARE_BASE = trimTrailingSlash(
  process.env.EXPO_PUBLIC_SHARE_BASE?.trim() || DEFAULT_PUBLIC_SHARE_BASE,
);
console.log('[API] Backend URL:', API_BASE);

// Helper for handling responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
}

async function fetchWithNetworkHint(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network request failed';

    if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
      const isLocalApi =
        API_BASE.includes('localhost') ||
        API_BASE.includes('127.0.0.1') ||
        API_BASE.includes('10.0.2.2') ||
        API_BASE.includes('192.168.') ||
        API_BASE.includes('172.16.') ||
        API_BASE.includes('172.17.') ||
        API_BASE.includes('172.18.') ||
        API_BASE.includes('172.19.') ||
        API_BASE.includes('172.20.') ||
        API_BASE.includes('172.21.') ||
        API_BASE.includes('172.22.') ||
        API_BASE.includes('172.23.') ||
        API_BASE.includes('172.24.') ||
        API_BASE.includes('172.25.') ||
        API_BASE.includes('172.26.') ||
        API_BASE.includes('172.27.') ||
        API_BASE.includes('172.28.') ||
        API_BASE.includes('172.29.') ||
        API_BASE.includes('172.30.') ||
        API_BASE.includes('172.31.');

      const guidance = __DEV__
        ? isLocalApi
          ? `Cannot connect to backend at ${API_BASE}. ` +
            `Make sure backend is running on port 8000. ` +
            `For Android USB device run: adb reverse tcp:8000 tcp:8000`
          : `Cannot connect to backend at ${API_BASE}. ` +
            `Check internet connection and verify the server is up.`
        : 'Cannot connect to backend service.';
      throw new Error(guidance);
    }

    throw error;
  }
}

// API Functions
export async function extractBill(imageUri: string): Promise<ExtractResponse> {
  const formData = new FormData();
  
  // Determine file type based on extension or default to jpeg
  const filename = imageUri.split('/').pop() || 'bill.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  
  formData.append('file', {
    uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
    type,
    name: filename,
  } as any);

  // Use AbortController for timeout (120 seconds for OCR processing — two sequential LLM calls)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetchWithNetworkHint('/extract-bill', {
      method: 'POST',
      body: formData,
      // Let fetch set Content-Type with boundary automatically for FormData
      signal: controller.signal,
    });

    return handleResponse<ExtractResponse>(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getBillData(billId: string): Promise<BillData> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}`);
  return handleResponse<BillData>(response);
}

export async function joinBill(billId: string, data: JoinRequest): Promise<JoinResponse> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<JoinResponse>(response);
}

export async function submitSelection(billId: string, data: SelectRequest): Promise<void> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export async function getSplitResults(billId: string): Promise<SplitResponse> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/split`);
  return handleResponse<SplitResponse>(response);
}

export async function getBillStatus(billId: string): Promise<StatusResponse> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/status`);
  return handleResponse<StatusResponse>(response);
}

export async function setExpectedPeople(billId: string, data: SetPeopleRequest): Promise<void> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/set-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export async function getSelections(billId: string): Promise<SelectionsResponse> {
  const response = await fetchWithNetworkHint(`/api/bill/${billId}/selections`);
  return handleResponse<SelectionsResponse>(response);
}

export function getShareUrl(billId: string): string {
  return `${PUBLIC_SHARE_BASE}/bill/${billId}`;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
