import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';

import {
  Badge,
  Heading,
  Pill,
  PillRow,
  HeroImage,
  CTAButton,
  TopGradient,
} from '../components/welcome';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export default function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />

      <TopGradient />

      <View style={styles.content}>
        <Badge text="FAIR SPLITTING, FINALLY" />

        <Heading
          prefix="Splito: "
          accent="You Eat It, "
          suffix="You Pay It."
        />

        <Text style={styles.description}>
          No more splitting equally when someone had the salad and you had the steak.
          Everyone pays for exactly what they ordered — fair and simple.
        </Text>

        <PillRow>
          <Pill label="Item-by-item" color="#22C55E" bg="#F0FDF4" border="#BBF7D0" />
          <Pill label="Always fair" color="#3B82F6" bg="#EFF6FF" border="#BFDBFE" />
          <Pill label="Zero drama" color="#F59E0B" bg="#FFFBEB" border="#FDE68A" />
        </PillRow>
      </View>

      <HeroImage source={require('../assets/wlsc.jpg')} />

      <View style={styles.footer}>
        <CTAButton
          text="Get Started"
          onPress={onGetStarted}
          subNote="No credit card · Free to use"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#efefef',
  },
  content: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});