import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: t('auth.login') }} />
      <Stack.Screen name="register" options={{ title: t('auth.register') }} />
      <Stack.Screen name="verify" options={{ title: t('auth.verifyTitle') }} />
      <Stack.Screen name="language" options={{ title: t('language.title') }} />
    </Stack>
  );
}
