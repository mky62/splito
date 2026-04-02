import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';
import type { SplitResponse } from '../../types/api';

interface SplitResultsProps {
  splitData: SplitResponse;
}

export const SplitResults: React.FC<SplitResultsProps> = ({ splitData }) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.cardIconBg]}>
            <CheckCircle2 size={18} color="#10B981" />
          </View>
          <Text style={styles.cardTitle}>Results</Text>
        </View>
      </View>

      {!splitData.allSubmitted ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingIconWrap}>
            <Clock size={24} color="#6366F1" />
          </View>
          <Text style={styles.waitingTitle}>Waiting for everyone</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${splitData.expectedUsers && splitData.expectedUsers > 0
                    ? Math.min(100, ((splitData.numSubmitted || 0) / splitData.expectedUsers) * 100)
                    : 0}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.waitingCount}>
            {splitData.numSubmitted || 0} of {splitData.expectedUsers || 0} submitted
          </Text>
        </View>
      ) : (
        <View>
          {Object.entries(splitData.users || {})
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([uid, userData]) => (
              <View key={uid} style={styles.userCard}>
                <View style={styles.userHeader}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{userData.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{userData.name}</Text>
                    {userData.items && userData.items.length > 0 && (
                      <Text style={styles.userItemCount}>{userData.items.length} items</Text>
                    )}
                  </View>
                  <Text style={styles.userAmount}>{userData.total.toFixed(2)}</Text>
                </View>
                {userData.items && userData.items.length > 0 && (
                  <View style={styles.userItemsList}>
                    {userData.items.map((item, idx) => (
                      <View key={idx} style={styles.userItem}>
                        <Text style={styles.userItemName}>{item.name}</Text>
                        <Text style={styles.userItemPrice}>{item.share.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

          {splitData.items && splitData.items.length > 0 && (
            <View style={styles.breakdownSection}>
              <Text style={styles.breakdownTitle}>Item Breakdown</Text>
              {splitData.items.map((item, idx) => (
                <View key={idx} style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemName}>{item.name}</Text>
                    <View style={styles.breakdownPriceRow}>
                      <Text style={[styles.breakdownItemPrice, item.type === 'discount' && styles.discountPrice]}>
                        {item.price.toFixed(2)}
                      </Text>
                      {item.type === 'discount' && (
                        <View style={styles.discountBadge}>
                          <Text style={styles.discountBadgeText}>Discount</Text>
                        </View>
                      )}
                      {item.type === 'tax' && (
                        <View style={styles.taxBadge}>
                          <Text style={styles.taxBadgeText}>Tax</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {typeof item.splitAmong === 'number' && item.splitAmong > 0 && (
                    <Text style={styles.breakdownSplitInfo}>Split among {item.splitAmong} people</Text>
                  )}
                  {item.selectors && item.selectors.length > 0 && (
                    <View style={styles.selectorsList}>
                      {item.selectors.map((selector: { userId: string; share: number }, sIdx: number) => (
                        <View key={sIdx} style={styles.selectorRow}>
                          <Text style={styles.selectorName}>
                            {splitData.users?.[selector.userId]?.name || selector.userId}
                          </Text>
                          <Text style={styles.selectorAmount}>{selector.share.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={styles.grandTotalCard}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>{splitData.total?.toFixed(2) || '0.00'}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  waitingCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  waitingIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTitle: {
    fontSize: 16,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
    marginBottom: 16,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  waitingCount: {
    fontSize: 14,
    fontFamily: 'Saira_500Medium',
    color: '#64748B',
  },
  userCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 16,
    fontFamily: 'Saira_700Bold',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  userItemCount: {
    fontSize: 12,
    fontFamily: 'Saira_500Medium',
    color: '#64748B',
    marginTop: 2,
  },
  userAmount: {
    fontSize: 17,
    fontFamily: 'Saira_700Bold',
    color: '#6366F1',
  },
  userItemsList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  userItemName: {
    fontSize: 13,
    fontFamily: 'Saira_500Medium',
    color: '#475569',
    flex: 1,
  },
  userItemPrice: {
    fontSize: 13,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  breakdownSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  breakdownTitle: {
    fontSize: 15,
    fontFamily: 'Saira_600SemiBold',
    color: '#334155',
    marginBottom: 12,
  },
  breakdownItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  breakdownItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownItemName: {
    fontSize: 14,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
    flex: 1,
  },
  breakdownPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownItemPrice: {
    fontSize: 14,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  taxBadge: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taxBadgeText: {
    color: '#C2410C',
    fontSize: 10,
    fontFamily: 'Saira_700Bold',
  },
  discountBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontFamily: 'Saira_700Bold',
  },
  discountPrice: {
    color: '#DC2626',
  },
  breakdownSplitInfo: {
    fontSize: 12,
    fontFamily: 'Saira_500Medium',
    color: '#64748B',
    marginTop: 4,
  },
  selectorsList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectorName: {
    fontSize: 13,
    fontFamily: 'Saira_500Medium',
    color: '#475569',
    flex: 1,
  },
  selectorAmount: {
    fontSize: 13,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  grandTotalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontFamily: 'Saira_600SemiBold',
    color: '#475569',
  },
  grandTotalValue: {
    fontSize: 22,
    fontFamily: 'Saira_700Bold',
    color: '#0F172A',
  },
});
