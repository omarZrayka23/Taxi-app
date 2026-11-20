import * as SecureStore from 'expo-secure-store';

/** Small key/value persistence (SecureStore). Never throws. */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

export const KEYS = {
  token: 'auth_token',
  mode: 'app_mode',
  language: 'app_language',
  rtlReloadTried: 'rtl_reload_tried',
};
