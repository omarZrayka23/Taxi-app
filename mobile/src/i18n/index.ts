import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Alert, DevSettings, I18nManager } from 'react-native';
import * as Updates from 'expo-updates';
import { getLocales } from 'expo-localization';
import type { Language } from '@/api/types';
import { KEYS, storage } from '@/lib/storage';
import ar from './ar.json';
import en from './en.json';

export const DEFAULT_LANGUAGE: Language = 'ar';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
];

/** Language suggested by the device (used only to highlight a choice in the picker). */
export function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'en' ? 'en' : 'ar';
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export async function getStoredLanguage(): Promise<Language | null> {
  const v = await storage.get(KEYS.language);
  return v === 'ar' || v === 'en' ? v : null;
}

let initialized = false;

/** Initialise i18next with the persisted language (default Arabic). Returns that language. */
export async function initI18n(): Promise<Language> {
  const lang = (await getStoredLanguage()) ?? DEFAULT_LANGUAGE;
  if (!initialized) {
    await i18n.use(initReactI18next).init({
      resources: { ar: { translation: ar }, en: { translation: en } },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    initialized = true;
  } else {
    await i18n.changeLanguage(lang);
  }
  return lang;
}

/** Returns true when a reload was started. */
async function reloadApp(): Promise<boolean> {
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    // not available (e.g. Expo Go / dev) — fall through
  }
  if (__DEV__) {
    DevSettings.reload();
    return true;
  }
  Alert.alert(i18n.t('language.restartTitle'), i18n.t('language.restartBody'));
  return false;
}

/**
 * Make the native layout direction match the language. When it differs, the app must
 * reload for the change to take effect. Returns true when a reload was triggered.
 * A timestamp guard avoids reload loops on hosts that reset RTL (e.g. Expo Go).
 */
export async function ensureDirection(lang: Language): Promise<boolean> {
  const rtl = lang === 'ar';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  const target = rtl ? 'rtl' : 'ltr';
  if (I18nManager.isRTL === rtl) {
    await storage.remove(KEYS.rtlReloadTried);
    return false;
  }

  // Reload at most once per target direction. Some hosts (e.g. Expo Go) only apply
  // forceRTL after a full app restart, so a JS reload would never fix it and a
  // time-based guard loops forever whenever a reload takes longer than the window.
  if ((await storage.get(KEYS.rtlReloadTried)) === target) return false;
  await storage.set(KEYS.rtlReloadTried, target);
  return reloadApp();
}

/** Persist + apply a language. Reloads the app if the direction changes. */
export async function setLanguage(lang: Language): Promise<void> {
  await storage.set(KEYS.language, lang);
  await i18n.changeLanguage(lang);
  await ensureDirection(lang);
}

export default i18n;
