import React from 'react';
import { StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

export function TopGradient() {
  return (
    <LinearGradient
      colors={['rgba(59,130,246,0.3)', 'transparent']}
      style={styles.topGradient}
    />
  );
}

const styles = StyleSheet.create({
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
});
