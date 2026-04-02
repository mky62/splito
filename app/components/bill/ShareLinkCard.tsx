import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Linking, Clipboard } from 'react-native';
import { Copy, ExternalLink, CheckCircle2 } from 'lucide-react-native';

interface ShareLinkCardProps {
  shareLink: string;
  totalPeople: number;
}

export const ShareLinkCard: React.FC<ShareLinkCardProps> = ({ shareLink, totalPeople }) => {
  const copyShareLink = async () => {
    if (shareLink) {
      await Clipboard.setString(shareLink);
      Alert.alert('Link Copied', 'Share link copied to clipboard');
    }
  };

  const openShareLink = () => {
    if (shareLink) {
      Linking.openURL(shareLink).catch(() => {
        Alert.alert('Error', 'Could not open link in browser');
      });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.cardIconBg]}>
            <CheckCircle2 size={18} color="#10B981" />
          </View>
          <Text style={styles.cardTitle}>Share Link Ready</Text>
        </View>
      </View>

      <Text style={styles.shareSubtitle}>Share with {totalPeople} people</Text>

      <View style={styles.linkBox}>
        <TextInput style={styles.linkInput} value={shareLink} editable={false} />
        <View style={styles.linkActions}>
          <TouchableOpacity onPress={copyShareLink} style={styles.linkActionBtn} activeOpacity={0.7}>
            <Copy size={18} color="#6366F1" />
          </TouchableOpacity>
          <TouchableOpacity onPress={openShareLink} style={[styles.linkActionBtn, styles.linkActionBtnSecondary]} activeOpacity={0.7}>
            <ExternalLink size={18} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>
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
  shareSubtitle: {
    fontSize: 14,
    fontFamily: 'Saira_500Medium',
    color: '#64748B',
    marginBottom: 12,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    fontFamily: 'Saira_500Medium',
    color: '#334155',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  linkActions: {
    gap: 8,
  },
  linkActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkActionBtnSecondary: {
    backgroundColor: '#F0FDF4',
  },
});
