import React, { useEffect, useRef } from 'react';
import { Image, Animated, Easing, StyleSheet, Text } from 'react-native';
import { COLORS } from '../theme';

const LOGO = require('../../assets/zcode-official.png');

type Props = { size?: number; glow?: boolean; showWordmark?: boolean };

export default function Logo({ size = 88, glow = true, showWordmark = false }: Props) {
  const ringPulse = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ring = Animated.loop(
      Animated.timing(ringPulse, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    ring.start();
    glowAnim.start();
    return () => { ring.stop(); glowAnim.stop(); };
  }, [ringPulse, glowPulse]);

  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.35] });

  return (
    <>
      {glow && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: (size * 1.8) / 2,
            backgroundColor: '#FFFFFF',
            opacity: glowOpacity,
          }}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.24,
          borderWidth: 1.5,
          borderColor: '#FFFFFF',
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
          position: 'absolute',
        }}
      />
      <Image source={LOGO} style={{ width: size, height: size, borderRadius: size * 0.24 }} resizeMode="cover" />
      {showWordmark && <Text style={styles.word}>ZCode</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  word: {
    marginTop: 18,
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
  },
});
