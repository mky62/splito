import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;

interface HeadingProps {
  prefix: string;
  accent: string;
  suffix: string;
}

export function Heading({ prefix, accent, suffix }: HeadingProps) {
  return (
    <View style={styles.headingContainer}>
      <Text style={styles.heading}>{prefix}</Text>
      <Text style={styles.headingAccent}>{accent}</Text>
      <Text style={styles.heading}>{suffix}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  heading: {
    fontSize: isSmallDevice ? 26 : 32,
    fontWeight: '700',
    color: '#111827',
  },
  headingAccent: {
    fontSize: isSmallDevice ? 26 : 32,
    fontWeight: '700',
    color: '#3B82F6',
    fontStyle: 'italic',
  },
});
