import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS } from '../theme';
import Logo from '../components/Logo';

type Props = { onScanned: (url: string) => void; onClose: () => void };

export default function ScanScreen({ onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [saving, setSaving] = useState(false);

  const onCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || saving) return;
      const trimmed = (data || '').trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        Alert.alert('Not a ZCode link', 'The QR code does not contain a valid remote URL.');
        return;
      }
      setScanned(true);
      setSaving(true);
      onScanned(trimmed);
    },
    [scanned, saving, onScanned]
  );

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Logo size={72} />
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.sub}>ZCode uses the camera only to scan remote-session QR codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 18 }}>
          <Text style={{ color: COLORS.textDim }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onCodeScanned} />
      {/* Scanner frame overlay */}
      <View style={styles.overlayTop} pointerEvents="none" />
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[styles.corner, { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 }]} />
          <View style={[styles.corner, { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[styles.corner, { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 }]} />
          {(scanned || saving) && <ActivityIndicator color={COLORS.accent} />}
        </View>
        <Text style={styles.hint}>{scanned ? 'Link captured — saving…' : 'Point the camera at the ZCode remote QR code'}</Text>
      </View>
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={{ color: COLORS.text, fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const FRAME = 240;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginTop: 20 },
  sub: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  btn: { marginTop: 24, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 13 },
  btnText: { color: '#000', fontWeight: '800' },
  overlayTop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  frameWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#fff' },
  hint: { marginTop: 26, color: '#fff', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, alignItems: 'center' },
  closeBtn: { backgroundColor: 'rgba(20,20,20,0.9)', borderRadius: 12, paddingHorizontal: 34, paddingVertical: 13, borderWidth: 1, borderColor: COLORS.cardBorder },
});
