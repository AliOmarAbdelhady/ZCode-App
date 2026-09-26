import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, View, ActivityIndicator, StyleSheet } from 'react-native';
import LockScreen from './src/screens/LockScreen';
import HomeScreen from './src/screens/HomeScreen';
import ConnectScreen from './src/screens/ConnectScreen';
import ScanScreen from './src/screens/ScanScreen';
import DictationSheet from './src/components/DictationSheet';
import { Session, loadSessions, getBiometricLock, addSession, getUnlockedUntil, setUnlockedUntil, UNLOCK_SESSION_MS } from './src/storage';
import { COLORS } from './src/theme';
import { startKeepAlive } from './src/keepalive';
import WakeLock from './modules/wake-lock';

type Route =
  | { screen: 'home' }
  | { screen: 'connect'; session: Session }
  | { screen: 'scan' };

export default function App() {
  const [booting, setBooting] = useState(true);
  const [locked, setLocked] = useState(false);
  const [route, setRoute] = useState<Route>({ screen: 'home' });
  const [dictationOpen, setDictationOpen] = useState(false);
  const appState = useRef(AppState.currentState);
  const lockEnabled = useRef(false);
  // Timestamp (ms) until which the app stays unlocked. Persisted so the 24h
  // session survives restarts. Written to the ref synchronously on unlock so
  // the app-state bounce from the system fingerprint dialog can't re-lock us.
  const unlockedUntil = useRef(0);

  async function unlock() {
    const until = Date.now() + UNLOCK_SESSION_MS;
    unlockedUntil.current = until;
    await setUnlockedUntil(until);
    setLocked(false);
  }

  useEffect(() => {
    startKeepAlive();
    // Hold a partial wake lock (user accepted the battery cost): the CPU
    // never suspends, so the session's page keeps running and syncing.
    try { WakeLock.acquire(); } catch {}

    (async () => {
      const [has, sessions, until] = await Promise.all([getBiometricLock(), loadSessions(), getUnlockedUntil()]);
      lockEnabled.current = has;
      unlockedUntil.current = until;
      const sessionValid = until > Date.now();
      setLocked(has && sessions.length > 0 && !sessionValid);
      // Auto-reconnect: open straight into the most recent session.
      if (sessions.length > 0) {
        const latest = sessions.reduce((a, b) =>
          ((b.lastUsedAt ?? b.createdAt) > (a.lastUsedAt ?? a.createdAt) ? b : a)
        );
        setRoute({ screen: 'connect', session: latest });
      }
      setBooting(false);
    })();

    const sub = AppState.addEventListener('change', (state) => {
      const previous = appState.current;
      appState.current = state;
      // Re-lock only when the unlock session has actually expired. The
      // fingerprint dialog itself bounces the app through "background", so
      // never lock just because the state changed while a session is valid.
      if (state === 'active' && previous !== 'active' && lockEnabled.current) {
        if (Date.now() >= unlockedUntil.current) setLocked(true);
      }
      if (state === 'active') {
        try { WakeLock.acquire(); } catch {}
      }
    });
    return () => sub.remove();
  }, []);

  async function handleScannedUrl(url: string) {
    const s = await addSession(url);
    setRoute({ screen: 'home' });
    if (s && route.screen === 'scan') {
      // saved successfully; stay on home where it now appears at the top
    }
  }

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (locked) {
    return (
      <>
        <StatusBar style="light" />
        <LockScreen onUnlock={unlock} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {route.screen === 'home' && (
        <HomeScreen
          onConnect={(s) => setRoute({ screen: 'connect', session: s })}
          onScan={() => setRoute({ screen: 'scan' })}
          onDictate={() => setDictationOpen(true)}
        />
      )}
      {route.screen === 'connect' && (
        <ConnectScreen
          session={route.session}
          onExit={() => setRoute({ screen: 'home' })}
          onDictate={() => setDictationOpen(true)}
        />
      )}
      {route.screen === 'scan' && (
        <ScanScreen onScanned={handleScannedUrl} onClose={() => setRoute({ screen: 'home' })} />
      )}
      <DictationSheet visible={dictationOpen} onClose={() => setDictationOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
});
