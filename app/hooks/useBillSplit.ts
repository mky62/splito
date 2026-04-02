import { useState, useCallback, useRef } from 'react';
import { extractBill, BillItem as ApiBillItem, SplitResponse, getSplitResults } from '../services/api';

interface BillItem {
  id: string;
  name: string;
  price: number;
  type?: string;
}

interface UseBillExtractionReturn {
  items: BillItem[];
  loading: boolean;
  error: string | null;
  billId: string | null;
  billTotal: number | null;
  hasExtracted: boolean;
  extractItems: (imageUri: string) => Promise<void>;
  updateItem: (id: string, field: 'name' | 'price', value: string) => void;
  addItem: () => void;
  deleteItem: (id: string) => void;
}

export function useBillExtraction(): UseBillExtractionReturn {
  const [items, setItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [billTotal, setBillTotal] = useState<number | null>(null);
  const [hasExtracted, setHasExtracted] = useState(false);

  const extractItems = useCallback(async (imageUri: string) => {
    if (!imageUri || hasExtracted) return;
    setLoading(true);
    setError(null);
    setHasExtracted(true);

    try {
      const response = await extractBill(imageUri);

      const parsedItems: BillItem[] = response.items
        .map((item: ApiBillItem, index: number) => ({
          id: `item-${index}`,
          name: item.name || 'Unknown',
          price: parseFloat(String(item.price)) || 0,
          type: item.type,
        }));

      setItems(parsedItems);
      setBillTotal(response.total || 0);

      if (response.bill_id) {
        setBillId(response.bill_id);
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      let errorMessage = 'Failed to extract items';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. OCR processing is taking too long.';
      } else if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Cannot connect to server. Please check your network and ensure the backend is running.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [hasExtracted]);

  const updateItem = useCallback((id: string, field: 'name' | 'price', value: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, [field]: field === 'price' ? parseFloat(value) || 0 : value }
          : item
      )
    );
  }, []);

  const addItem = useCallback(() => {
    const newId = `item-${Date.now()}`;
    setItems(prev => [...prev, { id: newId, name: '', price: 0 }]);
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return {
    items,
    loading,
    error,
    billId,
    billTotal,
    hasExtracted,
    extractItems,
    updateItem,
    addItem,
    deleteItem,
  };
}

interface UseSplitPollingReturn {
  splitData: SplitResponse | null;
  startSplitPolling: (billId: string) => void;
  stopPolling: () => void;
}

export function useSplitPolling(): UseSplitPollingReturn {
  const [splitData, setSplitData] = useState<SplitResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollSplit = useCallback(async (id: string) => {
    try {
      const data = await getSplitResults(id);
      setSplitData({
        allSubmitted: data.allSubmitted,
        numSubmitted: data.numSubmitted || 0,
        expectedUsers: data.expectedUsers || 0,
        users: data.users,
        total: data.total,
        currency: data.currency,
        items: data.items,
      });
    } catch {
      // Silently ignore poll errors — next poll will retry
    }
  }, []);

  const startSplitPolling = useCallback((billId: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollSplit(billId);
    intervalRef.current = setInterval(() => pollSplit(billId), 3000);
  }, [pollSplit]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { splitData, startSplitPolling, stopPolling };
}
