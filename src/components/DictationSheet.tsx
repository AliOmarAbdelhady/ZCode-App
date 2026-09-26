import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import { COLORS } from '../theme';
import MicIcon from './MicIcon';

type Props = { visible: boolean; onClose: () => void };

type Status = 'idle' | 'starting' | 'listening' | 'copying' | 'done' | 'error';

// Keeps the recognizer alive: Android auto-ends after silence, so we chain
// restarts until the user presses "Stop & copy".
const RESTART_DELAY_MS = 250;
const MAX_CONSECUTIVE_FAST_FAILS = 8;

export default function DictationSheet({ visible, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState('');
  const finalRef = useRef('');
  const partialRef = useRef('');
  const slide = useRef(new Animated.Value(-400)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true from Record until Stop & copy / close — drives auto-restart.
  const sessionActive = useRef(false);
  const fastFailCount = useRef(0);
  const lastEndAt = useRef(0);

  const startChime = useAudioPlayer(require('../../assets/dictation-start.wav'));
  const stopChime = useAudioPlayer(require('../../assets/dictation-stop.wav'));

  function playCue(p: typeof startChime) {
    try {
      p.seekTo(0);
      p.play();
    } catch {}
  }

  const startConfig = useCallback((): ExpoSpeechRecognitionOptions => ({
    lang: 'en-US',
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    // Use the phone's default recognizer (Google "Speech Recognition &
    // Synthesis"). No offline flag: if on-device models are missing it
    // falls back to Google's server recognition instead of erroring.
    androidIntentOptions: {
      EXTRA_LANGUAGE_MODEL: 'free_form',
      // Stretch the silence windows as far as the platform allows before it
      // considers the utterance finished.
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 15000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 10000,
    },
  }), []);

  // continueFromExisting: false = fresh dictation; true = append to what is
  // already in the transcript (the "Continue" button).
  const startListening = useCallback(async (continueFromExisting = false) => {
    if (!continueFromExisting) {
      finalRef.current = '';
      partialRef.current = '';
      setFinalText('');
      setPartial('');
    }
    setCopied('');
    setStatus('starting');
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!grantedOk(perm)) {
        setStatus('error');
        Alert.alert(
          'Microphone is blocked',
          'ZCode needs microphone access to dictate. Allow it in App settings, then tap Record again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      sessionActive.current = true;
      fastFailCount.current = 0;
      ExpoSpeechRecognitionModule.start(startConfig());
    } catch (e) {
      setStatus('error');
      Alert.alert('Could not start dictation', String(e));
    }
  }, [startConfig]);

  // Auto-restart while the session is active.
  const scheduleRestart = useCallback(() => {
    if (!sessionActive.current) return;
    const now = Date.now();
    if (now - lastEndAt.current < 700) {
      fastFailCount.current += 1;
    } else {
      fastFailCount.current = 0;
    }
    lastEndAt.current = now;
    if (fastFailCount.current > MAX_CONSECUTIVE_FAST_FAILS) {
      // Recognizer is crash-looping — stop instead of spinning forever.
      sessionActive.current = false;
      setStatus('error');
      return;
    }
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      if (!sessionActive.current) return;
      setStatus((cur) => (cur === 'copying' || cur === 'done' ? cur : 'listening'));
      try {
        ExpoSpeechRecognitionModule.start(startConfig());
      } catch {
        scheduleRestart();
      }
    }, RESTART_DELAY_MS);
  }, [startConfig]);

  function stopEverything(playSound: boolean) {
    sessionActive.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    if (playSound) playCue(stopChime);
    setStatus('idle');
  }

  function finishAndCopy() {
    const text = (finalRef.current || partialRef.current).trim();
    sessionActive.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    setStatus('copying');
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    playCue(stopChime);
    if (!text) {
      // Stopped without speaking anything — not an error; idle state lets
      // the user record again (or continue if text exists).
      setStatus('idle');
      return;
    }
    Clipboard.setStringAsync(text)
      .then(() => {
        setCopied(text);
        setStatus('done');
        // No auto-close: leave the sheet open so "Continue" is always
        // available if the user wants to add more to this transcript.
      })
      .catch(() => setStatus('error'));
  }

  // ---- slide in/out ----
  useEffect(() => {
    if (visible) {
      slide.setValue(-400);
      Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      startListening(false);
    } else {
      Animated.timing(slide, { toValue: -400, duration: 200, useNativeDriver: true }).start();
      stopEverything(false);
    }
    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, [visible]);

  // ---- mic pulse while listening ----
  useEffect(() => {
    if (status === 'listening' || status === 'starting') {
      const a = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      a.start();
      return () => a.stop();
    }
  }, [status, pulse]);

  // ---- speech events ----
  useSpeechRecognitionEvent('start', () => {
    setStatus('listening');
    playCue(startChime);
  });
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results?.[0]?.transcript ?? '';
    if (e.isFinal) {
      finalRef.current = (finalRef.current + ' ' + t).trim();
      setFinalText(finalRef.current);
      partialRef.current = '';
      setPartial('');
    } else {
      partialRef.current = t;
      setPartial(t);
    }
  });
  useSpeechRecognitionEvent('end', () => {
    // Silence timeouts land here — keep the session alive if the user hasn't
    // pressed stop; otherwise let copying/done/error states stand.
    if (sessionActive.current && status !== 'copying' && status !== 'done') {
      scheduleRestart();
    } else if (!sessionActive.current && status !== 'copying' && status !== 'done' && status !== 'error') {
      setStatus('idle');
    }
  });
  useSpeechRecognitionEvent('error', (e) => {
    const code = (e as any)?.error ?? 'unknown';
    if (sessionActive.current && (code === 'no-speech' || code === 'speech-timeout' || code === 'aborted')) {
      // Part of normal silence handling — the chained restart keeps going.
      return;
    }
    if (code === 'not-allowed' || code === 'audio-capture') {
      sessionActive.current = false;
      setStatus('error');
      Alert.alert(
        'Microphone is blocked',
        'ZCode needs microphone access to dictate. Allow it in App settings, then tap Record again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    if (!sessionActive.current) {
      setStatus('idle');
      return;
    }
    sessionActive.current = false;
    setStatus('error');
    Alert.alert('Dictation error', `Speech recognition failed (${code}). Check that Google speech services are available on the phone.`);
  });

  if (!visible) return null;

  const shown = [finalText, partial].filter(Boolean).join(' ');
  const hasText = finalText.trim().length > 0;

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
      <View style={styles.row}>
        <Animated.View style={[styles.micCircle, { opacity: status === 'listening' || status === 'starting' ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : 1 }]}>
          <MicIcon size={26} color="#000" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {status === 'done' ? 'Copied to clipboard ✓' :
             status === 'copying' ? 'Copying…' :
             status === 'error' ? 'Dictation error' :
             status === 'listening' ? 'Listening… pauses are fine' :
             status === 'starting' ? 'Starting…' : 'Stopped — continue or start over'}
          </Text>
          <Text style={styles.sub}>
            {status === 'done'
              ? hasText ? 'Paste it now, or continue to add more.' : 'Ready.'
              : status === 'listening' ? 'It keeps listening until you press Stop & copy.'
              : hasText ? 'Your text is kept — continue to add more.' : 'Tap Record to speak.'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => { stopEverything(true); onClose(); }} style={styles.x}>
          <Text style={{ color: COLORS.textDim, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {(shown || copied) && (
        <View style={styles.bubble}>
          <Text style={styles.transcript}>{copied || shown}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {status === 'listening' || status === 'starting' ? (
          <TouchableOpacity style={styles.stopBtn} onPress={finishAndCopy} activeOpacity={0.85}>
            <Text style={styles.stopText}>■  Stop & copy</Text>
          </TouchableOpacity>
        ) : status === 'copying' ? (
          <View style={styles.doneBtn}>
            <Text style={styles.doneText}>Copying…</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            {hasText && (
              <TouchableOpacity onPress={() => { finalRef.current = ''; partialRef.current = ''; setFinalText(''); setPartial(''); setCopied(''); setStatus('idle'); }} style={styles.reBtn} activeOpacity={0.85}>
                <Text style={styles.reText}>Start over</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={hasText ? styles.contBtn : styles.contBtnFull} onPress={() => startListening(true)} activeOpacity={0.85}>
              <Text style={styles.contText}>{hasText ? '●  Continue dictation' : '●  Record again'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function grantedOk(perm: any) {
  return perm && perm.granted;
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 46,
    left: 12,
    right: 12,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    zIndex: 100,
    elevation: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  micCircle: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  title: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  sub: { color: COLORS.textDim, fontSize: 12, marginTop: 3 },
  x: { padding: 6 },
  bubble: {
    backgroundColor: COLORS.bgSoft, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cardBorder,
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 66,
  },
  transcript: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  stopBtn: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  stopText: { color: '#000', fontWeight: '800', fontSize: 14 },
  doneBtn: { backgroundColor: COLORS.bgSoft, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, borderWidth: 1, borderColor: COLORS.cardBorder },
  doneText: { color: COLORS.success, fontWeight: '700', fontSize: 14 },
  reBtn: { backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1.5, borderColor: '#3A3A3A', marginRight: 8 },
  reText: { color: COLORS.textDim, fontWeight: '700', fontSize: 14 },
  contBtn: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  contBtnFull: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  contText: { color: '#000', fontWeight: '800', fontSize: 14 },
});
