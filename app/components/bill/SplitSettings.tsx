import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Users, Link2 } from 'lucide-react-native';

interface SplitSettingsProps {
  totalPeople: number;
  generatingLink: boolean;
  onTotalPeopleChange: (value: number) => void;
  onGenerateLink: () => void;
}

export const SplitSettings: React.FC<SplitSettingsProps> = ({
  totalPeople,
  generatingLink,
  onTotalPeopleChange,
  onGenerateLink,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.cardIconBg]}>
            <Users size={18} color="#3B82F6" />
          </View>
          <Text style={styles.cardTitle}>Split Settings</Text>
        </View>
      </View>

      <View style={styles.peopleSelector}>
        <Text style={styles.peopleLabel}>People</Text>
        <View style={styles.peopleCounter}>
          <TouchableOpacity
            onPress={() => onTotalPeopleChange(totalPeople - 1)}
            style={styles.counterBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.counterBtnText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.peopleCountInput}
            value={totalPeople.toString()}
            onChangeText={text => onTotalPeopleChange(parseInt(text, 10) || 2)}
            keyboardType="numeric"
          />
          <TouchableOpacity
            onPress={() => onTotalPeopleChange(totalPeople + 1)}
            style={styles.counterBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.counterBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, generatingLink && styles.generateBtnDisabled]}
        onPress={onGenerateLink}
        disabled={generatingLink}
        activeOpacity={0.8}
      >
        {generatingLink ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Link2 size={18} color="#FFFFFF" />
            <Text style={styles.generateBtnText}>Generate Link</Text>
          </>
        )}
      </TouchableOpacity>
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
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  peopleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  peopleLabel: {
    fontSize: 15,
    fontFamily: 'Saira_600SemiBold',
    color: '#475569',
  },
  peopleCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnText: {
    fontSize: 22,
    fontFamily: 'Saira_700Bold',
    color: '#6366F1',
  },
  peopleCountInput: {
    width: 50,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'Saira_700Bold',
    color: '#0F172A',
    paddingVertical: 6,
  },
  generateBtn: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  generateBtnDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Saira_600SemiBold',
  },
});
