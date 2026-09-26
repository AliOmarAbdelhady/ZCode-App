import React from 'react';
import { Image, StyleSheet } from 'react-native';

const MIC = require('../../assets/mic-black.png');

// Crisp pre-rendered mic glyph; tintColor recolors it (black default).
export default function MicIcon({ size = 22, color = '#000000' }: { size?: number; color?: string }) {
  return (
    <Image
      source={MIC}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}
