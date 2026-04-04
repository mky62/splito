import { create } from 'zustand';
import type { SplitResponse } from '../types/api';

export interface BillItem {
  id: string;
  name: string;
  price: number;
  type?: string;
}

export interface UserSelection {
  userId: string;
  userName: string;
  items: number[];
}

export interface SplitResult {
  userId: string;
  userName: string;
  total: number;
  items: { name: string; price: number; splitAmong: string[] }[];
}

export interface BillState {
  currentBill: {
    billId: string | null;
    items: BillItem[];
    total: number | null;
    currency: string;
    imageUri: string | null;
  };
  splitSettings: {
    totalPeople: number;
    linkGenerated: boolean;
    shareLink: string;
    generatingLink: boolean;
  };
  splitResults: SplitResponse;
  ui: {
    loading: boolean;
    extracting: boolean;
    error: string | null;
  };
}

interface BillActions {
  setImageUri: (uri: string) => void;
  setExtracting: (loading: boolean) => void;
  setExtracted: (data: { items: BillItem[]; total: number; currency: string; billId: string }) => void;
  setExtractionError: (error: string) => void;
  updateItem: (id: string, field: 'name' | 'price', value: string | number) => void;
  addItem: () => void;
  deleteItem: (id: string) => void;
  setTotalPeople: (count: number) => void;
  setLinkGenerating: (loading: boolean) => void;
  setLinkGenerated: (link: string) => void;
  updateSplitResults: (data: Partial<BillState['splitResults']>) => void;
  resetBill: () => void;
}

type BillStore = BillState & BillActions;

const initialState: BillState = {
  currentBill: {
    billId: null,
    items: [],
    total: null,
    currency: '',
    imageUri: null,
  },
  splitSettings: {
    totalPeople: 2,
    linkGenerated: false,
    shareLink: '',
    generatingLink: false,
  },
  splitResults: {
    allSubmitted: false,
    currency: '',
    numSubmitted: 0,
    expectedUsers: 0,
    users: {},
    items: [],
    total: 0,
  },
  ui: {
    loading: false,
    extracting: false,
    error: null,
  },
};

export const useBillStore = create<BillStore>((set) => ({
  ...initialState,

  setImageUri: (uri) =>
    set((state) => ({
      currentBill: { ...state.currentBill, imageUri: uri },
      ui: { ...state.ui, error: null },
    })),

  setExtracting: (loading) =>
    set((state) => ({
      ui: { ...state.ui, extracting: loading, error: null },
    })),

  setExtracted: (data) =>
    set((state) => ({
      currentBill: {
        ...state.currentBill,
        items: data.items,
        total: data.total,
        currency: data.currency,
        billId: data.billId,
      },
      ui: { ...state.ui, extracting: false },
    })),

  setExtractionError: (error) =>
    set((state) => ({
      ui: { ...state.ui, extracting: false, error },
    })),

  updateItem: (id, field, value) =>
    set((state) => ({
      currentBill: {
        ...state.currentBill,
        items: state.currentBill.items.map((item) =>
          item.id === id
            ? {
                ...item,
                [field]: field === 'price' ? Number(value) || 0 : value,
              }
            : item
        ),
      },
    })),

  addItem: () =>
    set((state) => ({
      currentBill: {
        ...state.currentBill,
        items: [
          ...state.currentBill.items,
          { id: `item-${Date.now()}`, name: '', price: 0 },
        ],
      },
    })),

  deleteItem: (id) =>
    set((state) => ({
      currentBill: {
        ...state.currentBill,
        items: state.currentBill.items.filter((item) => item.id !== id),
      },
    })),

  setTotalPeople: (count) =>
    set((state) => ({
      splitSettings: {
        ...state.splitSettings,
        totalPeople: Math.max(1, Math.min(50, count)),
      },
    })),

  setLinkGenerating: (loading) =>
    set((state) => ({
      splitSettings: { ...state.splitSettings, generatingLink: loading },
    })),

  setLinkGenerated: (link) =>
    set((state) => ({
      splitSettings: {
        ...state.splitSettings,
        linkGenerated: true,
        shareLink: link,
        generatingLink: false,
      },
    })),

  updateSplitResults: (data) =>
    set((state) => ({
      splitResults: { ...state.splitResults, ...data },
    })),

  resetBill: () => set(initialState),
}));
