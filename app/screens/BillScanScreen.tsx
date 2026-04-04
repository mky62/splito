import { View, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Text, Alert } from "react-native";
import { File, X, ArrowLeft, Receipt } from 'lucide-react-native';
import React, { useEffect, useCallback } from "react";
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { setExpectedPeople, getShareUrl, extractBill } from '../services/api';
import { useBillStore } from '../store/BillStore';
import { ItemEditor } from '../components/bill/ItemEditor';
import { SplitSettings } from '../components/bill/SplitSettings';
import { ShareLinkCard } from '../components/bill/ShareLinkCard';
import { SplitResults } from '../components/bill/SplitResults';

type BillScanScreenProps = NativeStackScreenProps<RootStackParamList, 'BillScan'>;

const BillScanScreen: React.FC<BillScanScreenProps> = ({ route, navigation }) => {
  const imageUri = route.params?.imageUri || '';
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  const {
    currentBill,
    splitSettings,
    splitResults,
    ui,
    setImageUri,
    setExtracting,
    setExtracted,
    setExtractionError,
    updateItem,
    addItem,
    deleteItem,
    setTotalPeople,
    setLinkGenerating,
    setLinkGenerated,
    updateSplitResults,
    resetBill,
  } = useBillStore();

  useEffect(() => {
    if (imageUri) {
      setImageUri(imageUri);
    }
    return () => {
      resetBill();
    };
  }, [imageUri, setImageUri, resetBill]);

  const handleExtractItems = useCallback(async () => {
    if (!imageUri || isProcessing) return;

    setIsProcessing(true);
    setExtracting(true);
    setExtractionError('');

    try {
      const response = await extractBill(imageUri);
      
      const items = response.items.map((item, index) => ({
        id: `item-${index}`,
        name: item.name || 'Unknown',
        price: parseFloat(String(item.price)) || 0,
        type: item.type,
      }));

      setExtracted({
        items,
        total: response.total || 0,
        currency: response.currency || '',
        billId: response.bill_id || '',
      });
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
      setExtractionError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, isProcessing, setExtracting, setExtracted, setExtractionError]);

  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const pollSplit = useCallback(async (billId: string) => {
    try {
      const { getSplitResults } = await import('../services/api');
      const data = await getSplitResults(billId);
      updateSplitResults({
        allSubmitted: data.allSubmitted,
        currency: data.currency || '',
        numSubmitted: data.numSubmitted || 0,
        expectedUsers: data.expectedUsers || 0,
        users: data.users || {},
        items: data.items || [],
        total: data.total || 0,
      });
    } catch {
      // Silently ignore poll errors — next poll will retry
    }
  }, [updateSplitResults]);

  const startSplitPolling = useCallback((billId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollSplit(billId);
    pollIntervalRef.current = setInterval(() => pollSplit(billId), 3000);
  }, [pollSplit]);

  const generateLink = useCallback(async () => {
    if (!currentBill.billId) {
      Alert.alert('Missing bill ID', "Couldn't create bill ID. Please extract again.");
      return;
    }

    setLinkGenerating(true);
    try {
      await setExpectedPeople(currentBill.billId, { totalPeople: splitSettings.totalPeople });
      const fullShareUrl = getShareUrl(currentBill.billId);
      setLinkGenerated(fullShareUrl);
      startSplitPolling(currentBill.billId);
    } catch {
      Alert.alert('Error', 'Failed to generate link. Please try again.');
    } finally {
      setLinkGenerating(false);
    }
  }, [currentBill.billId, splitSettings.totalPeople, setLinkGenerating, setLinkGenerated, startSplitPolling]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const canGenerateLink = Boolean(currentBill.billId) && !splitSettings.generatingLink;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill Scanner</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {imageUri && (
          <View style={styles.imageCard}>
            <Image source={{ uri: imageUri }} style={styles.billImage} />
            <View style={styles.imageOverlay}>
              <Receipt size={20} color="#FFFFFF" />
              <Text style={styles.imageOverlayText}>Bill Preview</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.extractBtn, (isProcessing || currentBill.items.length > 0) && styles.extractBtnDisabled]}
          onPress={handleExtractItems}
          disabled={isProcessing || currentBill.items.length > 0}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : currentBill.items.length > 0 ? (
            <>
              <File size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.extractBtnText}>Items Extracted</Text>
            </>
          ) : (
            <>
              <File size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.extractBtnText}>Extract Items</Text>
            </>
          )}
        </TouchableOpacity>

        {ui.error && (
          <View style={styles.errorCard}>
            <View style={styles.errorIconWrap}>
              <X size={20} color="#DC2626" />
            </View>
            <Text style={styles.errorMsg}>{ui.error}</Text>
          </View>
        )}

        {currentBill.items.length > 0 && (
          <ItemEditor
            items={currentBill.items}
            billTotal={currentBill.total}
            updateItem={updateItem}
            addItem={addItem}
            deleteItem={deleteItem}
          />
        )}

        {currentBill.items.length > 0 && !splitSettings.linkGenerated && (
          <SplitSettings
            totalPeople={splitSettings.totalPeople}
            generatingLink={splitSettings.generatingLink}
            onTotalPeopleChange={setTotalPeople}
            onGenerateLink={generateLink}
            disabled={!canGenerateLink}
            helperText={!currentBill.billId ? "Couldn't create bill ID. Please extract again." : undefined}
          />
        )}

        {splitSettings.linkGenerated && splitSettings.shareLink && (
          <ShareLinkCard shareLink={splitSettings.shareLink} totalPeople={splitSettings.totalPeople} />
        )}

        {splitSettings.linkGenerated && (splitResults.expectedUsers > 0 || splitResults.numSubmitted > 0 || splitResults.allSubmitted) && (
          <SplitResults splitData={splitResults} />
        )}
      </ScrollView>
    </View>
  );
};

export default BillScanScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Saira_700Bold',
    color: '#0F172A',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  imageCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  billImage: {
    width: '100%',
    height: 220,
    resizeMode: 'contain',
    backgroundColor: '#F1F5F9',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 6,
  },
  imageOverlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Saira_600SemiBold',
  },
  extractBtn: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 16,
    gap: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  extractBtnDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  extractBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Saira_600SemiBold',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorMsg: {
    flex: 1,
    color: '#991B1B',
    fontSize: 14,
    fontFamily: 'Saira_500Medium',
  },
});
