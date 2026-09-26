const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Copies the notification icons into the Android res folder so notifee's
// smallIcon/largeIcon can reference them.
module.exports = function notificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable-xxxhdpi'
      );
      fs.mkdirSync(resDir, { recursive: true });
      const icons = {
        'ic_zcode_small.png': 'notification-small.png',
        'ic_zcode_large.png': 'notification-large.png',
      };
      for (const [dest, src] of Object.entries(icons)) {
        fs.copyFileSync(
          path.join(config.modRequest.projectRoot, 'assets', src),
          path.join(resDir, dest)
        );
      }
      return config;
    },
  ]);
};
