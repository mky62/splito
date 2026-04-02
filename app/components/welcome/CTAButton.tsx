import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { ArrowRight } from 'lucide-react-native';

interface CTAButtonProps {
  text: string;
  onPress: () => void;
  subNote?: string;
}

export function CTAButton({ text, onPress, subNote }: CTAButtonProps) {
  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>{text}</Text>
        <ArrowRight size={18} color="#111827" strokeWidth={2.5} />
      </TouchableOpacity>
      {subNote && <Text style={styles.subNote}>{subNote}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#FBBF24',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subNote: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 40,
  },
});
