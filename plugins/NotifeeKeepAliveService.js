const { withAndroidManifest } = require('expo/config-plugins');

// Declares notifee's foreground service with the dataSync type so it is
// legal on Android 14+, and stopWithTask=false so swiping the app away
// does not stop the background connection.
module.exports = function notifeeKeepAliveService(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.service = (app.service || []).filter(
      (s) => s.$['android:name'] !== 'app.notifee.core.ForegroundService'
    );
    app.service.push({
      $: {
        'android:name': 'app.notifee.core.ForegroundService',
        'android:foregroundServiceType': 'dataSync|shortService',
        'android:stopWithTask': 'false',
      },
    });
    return config;
  });
};
