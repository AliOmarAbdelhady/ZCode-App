import { Platform, AppState } from 'react-native';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';

const SMALL_ICON = 'ic_zcode_small';
const LARGE_ICON = 'ic_zcode_large';

// Keeps the app process alive in the background so the remote-session
// WebSocket stays connected and chats stay in sync with the laptop.
// Implemented as an Android foreground service with a silent ongoing
// notification — the standard way messaging apps avoid being killed.
export async function startKeepAlive() {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.requestPermission();
    const channelId = await notifee.createChannel({
      id: 'zcode-keepalive',
      name: 'Connection',
      importance: AndroidImportance.LOW,
    });
    // A never-resolving promise keeps the service running indefinitely.
    notifee.registerForegroundService(() => new Promise(() => {}));
    await notifee.displayNotification({
      id: 'zcode-keepalive',
      title: 'ZCode',
      body: 'Connected — messages stay in sync with your laptop',
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        color: '#0A0A0A',
        smallIcon: SMALL_ICON,
        largeIcon: LARGE_ICON,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      },
    });
  } catch {
    // Keep-alive is best-effort; the app still works without it.
  }
}

// Heads-up notification when the agent finishes answering a prompt.
// Only fires while the app is in the background — if you are already
// looking at the chat, there is nothing to tell you.
export async function notifyPromptFinished() {
  if (Platform.OS !== 'android') return;
  if (AppState.currentState === 'active') return;
  try {
    const channelId = await notifee.createChannel({
      id: 'zcode-alerts',
      name: 'Prompt updates',
      importance: AndroidImportance.HIGH,
    });
    await notifee.displayNotification({
      id: 'zcode-prompt-finished',
      title: 'ZCode',
      body: 'Your prompt finished — the reply is ready',
      android: {
        channelId,
        color: '#0A0A0A',
        smallIcon: SMALL_ICON,
        largeIcon: LARGE_ICON,
        autoCancel: true,
        pressAction: { id: 'default' },
      },
    });
  } catch {}
}
