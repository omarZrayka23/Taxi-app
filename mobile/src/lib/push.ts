import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { authApi } from '@/api/endpoints';

/**
 * Register for push notifications and send the Expo push token to the backend.
 * Fails silently: Expo Go (SDK 53+) has no remote push on Android, emulators have no token,
 * and a missing EAS projectId prevents token creation.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return; // Expo Go
    // Lazy require so Expo Go never loads the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token?.data) await authApi.updateMe({ expoPushToken: token.data });
  } catch (e) {
    if (__DEV__) console.warn('[push] registration skipped:', e instanceof Error ? e.message : e);
  }
}
