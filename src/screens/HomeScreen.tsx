import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Switch, ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Logo from '../components/Logo';
import MicIcon from '../components/MicIcon';
import { COLORS } from '../theme';
import { Session, addSession, loadSessions, removeSession, getBiometricLock, setBiometricLock, setUnlockedUntil, UNLOCK_SESSION_MS } from '../storage';

type Props = {
  onConnect: (s: Session) => void;
  onScan: () => void;
  onDictate: () => void;
};

export default function HomeScreen({ onConnect, onScan, onDictate }: Props) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLock, setBioLock] = useState(false);

  async function refresh() {
    setSessions(await loadSessions());
  }

  useEffect(() => {
    (async () => {
      await refresh();
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(!!has && !!enrolled);
      setBioLock(await getBiometricLock());
    })();
  }, []);

  async function handleAdd() {
    if (!link.trim()) return;
    setAdding(true);
    const s = await addSession(link);
    setAdding(false);
    if (!s) {
      Alert.alert('Invalid link', 'That does not look like a valid ZCode remote URL.');
      return;
    }
    if (name.trim()) {
      const { saveSessions } = await import('../storage');
      const list = await loadSessions();
      const t = list.find((x) => x.id === s.id);
      if (t) t.name = name.trim();
      await saveSessions(list);
    }
    setLink('');
    setName('');
    await refresh();
  }

  async function handleDelete(s: Session) {
    Alert.alert('Remove session', `Remove "${s.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeSession(s.id);
          await refresh();
        },
      },
    ]);
  }

  async function toggleBio(v: boolean) {
    if (v) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable biometric lock' });
      if (!res.success) return;
      // Enabling already proved identity — start the 24h unlocked session now.
      await setUnlockedUntil(Date.now() + UNLOCK_SESSION_MS);
    }
    await setBiometricLock(v);
    setBioLock(v);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Logo size={42} glow={false} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.h1}>ZCode</Text>
            <Text style={styles.h1sub}>Remote · Secure · Always on</Text>
          </View>
          <TouchableOpacity style={styles.micBtn} onPress={onDictate} activeOpacity={0.8}>
            <MicIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New connection</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste your ZCode remote link (https://zcode.z.ai/remote/v4?...)"
              placeholderTextColor={COLORS.textDim}
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Nickname (e.g. My Laptop)"
              placeholderTextColor={COLORS.textDim}
              value={name}
              onChangeText={setName}
            />
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={adding} activeOpacity={0.85}>
                {adding ? <ActivityIndicator color="#000" /> : <Text style={styles.addText}>Save session</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.scanBtn} onPress={onScan} activeOpacity={0.85}>
                <Text style={styles.scanText}>⬛  Scan QR</Text>
              </TouchableOpacity>
            </View>
          </View>

          {sessions === null ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 30 }} />
          ) : sessions.length === 0 ? (
            <View style={styles.empty}>
              <Logo size={64} />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySub}>Paste a remote link or scan its QR code — it will be stored securely on this device.</Text>
            </View>
          ) : (
            sessions.map((item) => (
              <TouchableOpacity key={item.id} style={styles.session} activeOpacity={0.85} onPress={() => onConnect(item)}>
                <View style={styles.sessionIcon}>
                  <Text style={{ color: '#000', fontWeight: '800', fontSize: 18 }}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionName}>{item.name}</Text>
                  <Text style={styles.sessionMeta}>
                    {new Date(item.lastUsedAt ?? item.createdAt).toLocaleString()} · tap to connect
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.del}>
                  <Text style={{ color: COLORS.danger, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}

          {bioAvailable && (
            <View style={styles.securityRow}>
              <Text style={styles.securityText}>🔐  Biometric lock</Text>
              <Switch
                value={bioLock}
                onValueChange={toggleBio}
                trackColor={{ false: '#2A2A2A', true: '#FFFFFF' }}
                thumbColor="#000"
              />
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20, paddingTop: 58 },
  scroll: { paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  h1: { color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  h1sub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  micBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 16 },
  cardTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 12 },
  input: { backgroundColor: COLORS.bgSoft, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cardBorder, color: COLORS.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13 },
  btnRow: { marginTop: 12, flexDirection: 'row' },
  addBtn: { flex: 1.4, borderRadius: 12, backgroundColor: '#FFFFFF', paddingVertical: 14, alignItems: 'center' },
  addText: { color: '#000', fontWeight: '800', fontSize: 15 },
  scanBtn: { flex: 1, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#FFFFFF', paddingVertical: 14, alignItems: 'center', marginLeft: 10 },
  scanText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 30 },
  emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: 17, marginTop: 16 },
  emptySub: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  session: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 14, marginTop: 12 },
  sessionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sessionName: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  sessionMeta: { color: COLORS.textDim, fontSize: 12, marginTop: 3 },
  del: { padding: 8 },
  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, marginTop: 18, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  securityText: { color: COLORS.textDim, fontSize: 14 },
});
