import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

interface HeroImageProps {
  source: any;
}

export function HeroImage({ source }: HeroImageProps) {
  return (
    <View style={styles.imageContainer}>
      <Image
        source={source}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 24,
    minHeight: 200,
  },
  image: {
    width: '100%',
    height: '80%',
  },
});
