import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Logo from '../components/Logo';
import { COLORS } from '../theme';

type Props = { onUnlock: () => void };

// The native fingerprint/face dialog opens automatically the moment this screen
// appears — no button press needed. If it is cancelled, tap anywhere to re-prompt.
export default function LockScreen({ onUnlock }: Props) {
  const [cancelled, setCancelled] = useState(false);

  const authenticate = useCallback(async () => {
    setCancelled(false);
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      onUnlock();
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock ZCode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) onUnlock();
    else setCancelled(true);
  }, [onUnlock]);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  return (
    <TouchableOpacity style={styles.root} activeOpacity={1} onPress={authenticate}>
      <View style={styles.center}>
        <Logo size={96} />
        <Text style={styles.title}>{cancelled ? 'Tap to unlock' : 'Waiting for fingerprint…'}</Text>
        <Text style={styles.subtitle}>
          {cancelled ? 'Tap anywhere to scan again' : 'Touch the fingerprint sensor'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { marginTop: 28, fontSize: 18, fontWeight: '700', color: COLORS.text },
  subtitle: { marginTop: 8, fontSize: 13, color: COLORS.textDim },
});
