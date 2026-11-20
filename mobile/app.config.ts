import type { ExpoConfig } from 'expo/config';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

const LOCATION_WHEN_IN_USE =
  'Cedra uses your location to set your pickup point and, for drivers, to receive nearby ride requests.';

const config: ExpoConfig = {
  name: 'Cedra',
  slug: 'cedra',
  scheme: 'cedra',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.cedra.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      NSCameraUsageDescription: 'Cedra uses the camera to photograph your documents and cars.',
      NSPhotoLibraryUsageDescription: 'Cedra needs access to your photos to upload documents and car photos.',
    },
  },
  android: {
    package: 'com.cedra.app',
    adaptiveIcon: {
      backgroundColor: '#FFC107',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'READ_MEDIA_IMAGES',
      'POST_NOTIFICATIONS',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    ['expo-localization', { supportsRTL: true }],
    ['expo-location', { locationWhenInUsePermission: LOCATION_WHEN_IN_USE }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Cedra needs access to your photos to upload documents and car photos.',
        cameraPermission: 'Cedra uses the camera to photograph your documents and cars.',
      },
    ],
    ['expo-notifications', { color: '#FFC107' }],
    // Google Maps key for Android release/dev builds (Expo Go does not need it).
    ['react-native-maps', { androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY }],
  ],
  extra: {
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
};

export default config;
