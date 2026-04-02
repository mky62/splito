import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PillProps {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export function Pill({ label, color, bg, border }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function PillRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.pillRow}>{children}</View>;
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 0.5,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
