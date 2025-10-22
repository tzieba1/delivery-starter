/**
 * app.config.js - Environment-Aware Expo Configuration
 * 
 * Dynamically configures app based on environment variables
 * Allows different API URLs for development, staging, production
 */
import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  name: process.env.APP_NAME || 'Delivery App',
  slug: 'delivery-app',
  version: process.env.APP_VERSION || '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#007AFF',
  },
  updates: {
    fallbackToCacheTimeout: 0,
    url: process.env.EXPO_UPDATES_URL,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.IOS_BUNDLE_ID || 'com.example.delivery',
    buildNumber: process.env.IOS_BUILD_NUMBER || '1',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    package: process.env.ANDROID_PACKAGE || 'com.example.delivery',
    versionCode: parseInt(process.env.ANDROID_VERSION_CODE || '1'),
  },
  extra: {
    // Environment-specific API URL
    apiUrl: process.env.API_URL || 'http://localhost:8000',
    environment: process.env.NODE_ENV || 'development',
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
