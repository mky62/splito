import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeProps {
  text: string;
}

export function Badge({ text }: BadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginBottom: 16,
    marginTop: 20,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 1.2,
  },
});
