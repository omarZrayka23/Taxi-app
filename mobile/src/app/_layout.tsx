import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ensureDirection, initI18n } from '@/i18n';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/store/auth';
import { SessionEffects } from '@/components/SessionEffects';
import { LoadingView } from '@/components/ui';
import { colors } from '@/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
      void useAuth.getState().bootstrap();
    };
    // Safety net: never stay on the splash if a reload doesn't happen.
    const safety = setTimeout(finish, 4000);
    (async () => {
      try {
        const lang = await initI18n();
        const reloading = await ensureDirection(lang);
        if (!reloading) finish();
      } catch {
        finish();
      }
    })();
    return () => clearTimeout(safety);
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        {ready ? <AppStack /> : <LoadingView />}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const { t } = useTranslation();
  return (
    <>
      <SessionEffects />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(passenger)" options={{ headerShown: false }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        <Stack.Screen name="(owner)" options={{ headerShown: false }} />
        <Stack.Screen name="rental/[id]" options={{ title: t('rentals.detailTitle') }} />
        <Stack.Screen name="booking/[id]" options={{ title: t('bookings.detailTitle') }} />
        <Stack.Screen name="documents" options={{ title: t('documents.title') }} />
        <Stack.Screen name="driver-apply" options={{ title: t('driverApply.title') }} />
        <Stack.Screen name="driver-ride/[id]" options={{ title: t('driverRide.title') }} />
        <Stack.Screen name="owner-apply" options={{ title: t('ownerApply.title') }} />
        <Stack.Screen name="listing-edit/[id]" options={{ title: t('listingForm.title') }} />
      </Stack>
    </>
  );
}
