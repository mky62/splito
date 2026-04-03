import { Platform } from 'react-native';
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

const resolveApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE;
  if (envUrl) return envUrl;
  if (__DEV__) {
    return 'http://192.168.29.251:8000';
  }
  throw new Error(
    'EXPO_PUBLIC_API_BASE environment variable is required in production builds. ' +
    'Set it to your backend URL (e.g., https://api.splito.app)'
  );
};

const API_BASE = resolveApiBaseUrl();
console.log('[API] Backend URL:', API_BASE);

// Helper for handling responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
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
    const response = await fetch(`${API_BASE}/extract-bill`, {
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
  const response = await fetch(`${API_BASE}/api/bill/${billId}`);
  return handleResponse<BillData>(response);
}

export async function joinBill(billId: string, data: JoinRequest): Promise<JoinResponse> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<JoinResponse>(response);
}

export async function submitSelection(billId: string, data: SelectRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export async function getSplitResults(billId: string): Promise<SplitResponse> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/split`);
  return handleResponse<SplitResponse>(response);
}

export async function getBillStatus(billId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/status`);
  return handleResponse<StatusResponse>(response);
}

export async function setExpectedPeople(billId: string, data: SetPeopleRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/set-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export async function getSelections(billId: string): Promise<SelectionsResponse> {
  const response = await fetch(`${API_BASE}/api/bill/${billId}/selections`);
  return handleResponse<SelectionsResponse>(response);
}

export function getShareUrl(billId: string): string {
  return `${API_BASE}/bill/${billId}`;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}