import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.akbar.mydashboard',
  appName: 'My Dashboard',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'mydashboard',
      androidIsEncryption: false,
      electronWindowsLocation: 'C:\\ProgramData\\CapacitorDatabases',
      electronMacLocation: '/Users/Shared/CapacitorDatabases',
      electronLinuxLocation: 'Databases'
    },
    "CapacitorHttp": {"enabled": true},
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    }
  },
  "android": {
    "allowMixedContent": true
  }
};

export default config;
