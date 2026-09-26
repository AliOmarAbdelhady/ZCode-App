import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../theme';
import { Session, touchSession } from '../storage';
import Logo from '../components/Logo';
import MicIcon from '../components/MicIcon';
import { notifyPromptFinished } from '../keepalive';

// Watches the remote chat page for the turn finishing: while the agent is
// working, the composer shows a stop/interrupt button; when it goes away the
// turn is done. Falls back to a streaming-silence heuristic. Either way it
// posts a message to the app, which raises a heads-up notification.
const PROMPT_WATCH_JS = `
(function(){
  if (window.__zcodePromptWatch) return; window.__zcodePromptWatch = true;
  var busy = false, busySeenAt = 0, lastNotified = 0;
  var burstChars = 0, burstActive = false, burstTimer = null;
  function notify(kind) {
    var now = Date.now();
    if (now - lastNotified < 15000) return;
    lastNotified = now;
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'promptFinished', via: kind }));
  }
  setInterval(function () {
    var stopSeen = false;
    try {
      var els = document.querySelectorAll('button,[role="button"]');
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        var s = ((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.textContent || '')).toLowerCase();
        if ((s.indexOf('stop') > -1 || s.indexOf('interrupt') > -1 || s.indexOf('abort') > -1) && s.indexOf('stopwatch') === -1) { stopSeen = true; break; }
      }
    } catch (err) {}
    if (stopSeen) { busy = true; busySeenAt = Date.now(); }
    else if (busy && Date.now() - busySeenAt > 1500) { busy = false; notify('stop-button'); }
  }, 2000);
  new MutationObserver(function (muts) {
    var added = 0;
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { added += ((m.target && m.target.textContent) || '').length; }
      else if (m.addedNodes) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 3) added += (n.textContent || '').length;
          else if (n.nodeType === 1) { try { added += (n.innerText || '').length; } catch (err) {} }
        }
      }
    }
    if (added > 2) {
      burstChars += added; burstActive = true;
      if (burstTimer) clearTimeout(burstTimer);
      burstTimer = setTimeout(function () {
        if (burstActive && burstChars > 120 && !busy) { burstActive = false; burstChars = 0; notify('stream-pause'); }
        else { burstActive = false; burstChars = 0; }
      }, 6000);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // Keep the network path warm while backgrounded so Android does not
  // silently clamp the page's connection.
  setInterval(function () {
    try { fetch(location.origin + '/favicon.ico', { cache: 'no-store' }).catch(function () {}); } catch (e) {}
  }, 60000);
  // Heartbeat so the app knows whether this page is alive and connected.
  // If heartbeats stop, the app shows its branded splash and reloads on
  // return instead of exposing the raw pairing screen.
  setInterval(function () {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'heartbeat' }));
  }, 20000);
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'heartbeat' }));
})();
true;
`;

type Props = { session: Session; onExit: () => void; onDictate: () => void };

export default function ConnectScreen({ session, onExit, onDictate }: Props) {
  const webRef = useRef<WebView>(null);
  const [error, setError] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const backgroundedAt = useRef(0);
  const lastBeat = useRef(Date.now());
  const bgReload = useRef<ReturnType<typeof setInterval> | null>(null);
  // When returning after a stretch in the background, the page's socket may
  // have been killed by the OS or the relay. If its heartbeat is stale we
  // reload behind a branded splash — the raw pairing steps are never shown.
  const STALE_MS = 45000;
  const BG_REFRESH_MS = 3 * 60 * 1000;

  React.useEffect(() => {
    touchSession(session.id);
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    const stateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        // Refresh the page periodically while hidden so the connection is
        // always young when the user comes back.
        if (bgReload.current) clearInterval(bgReload.current);
        bgReload.current = setInterval(() => {
          webRef.current?.reload();
        }, BG_REFRESH_MS);
      } else if (state === 'active') {
        if (bgReload.current) {
          clearInterval(bgReload.current);
          bgReload.current = null;
        }
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        if (away > 30000 && Date.now() - lastBeat.current > STALE_MS) {
          // Page is dead or stale — reload behind the splash.
          setResyncing(true);
          setError(false);
          webRef.current?.reload();
        }
        backgroundedAt.current = 0;
      }
    });
    return () => {
      backSub.remove();
      stateSub.remove();
      if (bgReload.current) clearInterval(bgReload.current);
    };
  }, [session.id]);

  const reload = useCallback(() => {
    setError(false);
    webRef.current?.reload();
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={onExit} style={styles.back}>
          <Text style={{ color: COLORS.text, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.dot} />
          <Text style={styles.host} numberOfLines={1}>{session.name}</Text>
        </View>
        <TouchableOpacity onPress={onDictate} style={styles.mic} activeOpacity={0.8}>
          <MicIcon size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={reload} style={styles.reload}>
          <Text style={{ color: COLORS.text, fontSize: 16 }}>⟳</Text>
        </TouchableOpacity>
      </View>

      <WebView
        ref={webRef}
        source={{ uri: session.url }}
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        injectedJavaScript={PROMPT_WATCH_JS}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (!msg) return;
            if (msg.type === 'heartbeat') lastBeat.current = Date.now();
            if (msg.type === 'promptFinished') notifyPromptFinished();
          } catch {}
        }}
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
        renderLoading={() => (
          <View style={styles.overlay}>
            <Logo size={92} />
            <Text style={styles.overlayText}>Connecting to {session.name}…</Text>
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 18 }} />
          </View>
        )}
        onError={() => setError(true)}
        onLoadEnd={() => {
          // If this load was a resync, give the page a moment to handshake,
          // then drop the splash and reveal the (already synced) chat.
          if (resyncing) {
            setTimeout(() => setResyncing(false), 1500);
          }
        }}
        onRenderProcessGone={() => {
          // WebView renderer was killed by the system — reload immediately.
          setError(false);
          webRef.current?.reload();
        }}
      />

      {error && (
        <View style={styles.overlay}>
          <Logo size={80} />
          <Text style={styles.overlayText}>Connection problem</Text>
          <Text style={styles.overlaySub}>The remote session could not be reached. The link may have expired — generate a fresh one from the web client, or check your internet.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {resyncing && !error && (
        <View style={styles.overlay}>
          <Logo size={96} />
          <Text style={styles.overlayText}>Syncing with your laptop…</Text>
          <ActivityIndicator color={COLORS.text} style={{ marginTop: 16 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 12, paddingHorizontal: 12, backgroundColor: COLORS.bgSoft, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  back: { padding: 8, paddingRight: 14 },
  reload: { padding: 8 },
  mic: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.bgSoft, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginRight: 8 },
  host: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  overlayText: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginTop: 22 },
  overlaySub: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  retryBtn: { marginTop: 26, borderRadius: 12, paddingHorizontal: 34, paddingVertical: 12, backgroundColor: '#FFFFFF' },
  retryText: { color: '#000', fontWeight: '800' },
});
