import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi, driverApi } from '@/api/endpoints';
import { useAppConfig } from '@/api/queries';
import type { Language } from '@/api/types';
import { LANGUAGES, setLanguage } from '@/i18n';
import { canUseDriverMode, canUseOwnerMode, effectiveMode, useAuth, type AppMode } from '@/store/auth';
import { callPhone } from '@/lib/links';
import { errorMessage } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  ListRow,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  StatusBadge,
  TextField,
  Txt,
} from '@/components/ui';
import { spacing } from '@/theme';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuth((s) => s.user);
  const mode = useAuth((s) => s.mode);
  const { data: config } = useAppConfig();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!user) return null;
  const current = effectiveMode(user, mode);

  const modes: { value: AppMode; label: string }[] = [{ value: 'passenger', label: t('modes.passenger') }];
  if (canUseDriverMode(user)) modes.push({ value: 'driver', label: t('modes.driver') });
  if (canUseOwnerMode(user)) modes.push({ value: 'owner', label: t('modes.owner') });

  const goOfflineIfNeeded = async () => {
    if (useAuth.getState().user?.driverProfile?.isOnline) {
      try {
        const { driverProfile } = await driverApi.offline();
        useAuth.getState().setDriverProfile(driverProfile);
      } catch {
        // ignore — server will expire stale locations
      }
    }
  };

  const switchMode = async (m: AppMode) => {
    if (m === current || switching) return;
    setSwitching(true);
    try {
      if (current === 'driver') await goOfflineIfNeeded();
      await useAuth.getState().setMode(m);
      router.replace('/');
    } finally {
      setSwitching(false);
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) return;
    setSaving(true);
    try {
      const { user: u } = await authApi.updateMe({ name: name.trim() });
      useAuth.getState().setUser(u);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const changeLanguage = async (lang: Language) => {
    if (lang === i18n.language) return;
    try {
      const { user: u } = await authApi.updateMe({ language: lang });
      useAuth.getState().setUser(u);
    } catch {
      // keep local choice even if the server is unreachable
    }
    await setLanguage(lang);
  };

  const logout = () => {
    Alert.alert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: async () => {
          await goOfflineIfNeeded();
          await useAuth.getState().signOut();
          router.replace('/welcome');
        },
      },
    ]);
  };

  const dp = user.driverProfile;
  const op = user.ownerProfile;

  return (
    <Screen scroll>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="subtitle">{user.name}</Txt>
            <Txt variant="muted" style={{ writingDirection: 'ltr', textAlign: 'left' }}>
              {user.phone}
            </Txt>
          </View>
          {user.phoneVerified ? <Badge label={t('profile.verified')} tone="success" /> : null}
        </Row>
        <View style={{ marginTop: spacing.md }}>
          <TextField label={t('auth.name')} value={name} onChangeText={setName} />
          {name.trim() !== user.name ? (
            <Button title={t('common.save')} onPress={saveName} loading={saving} small />
          ) : null}
        </View>
      </Card>

      <SectionTitle>{t('profile.mode')}</SectionTitle>
      {modes.length > 1 ? (
        <Segmented options={modes} value={current} onChange={(m) => void switchMode(m)} />
      ) : (
        <Txt variant="muted">{t('profile.modeHint')}</Txt>
      )}

      <SectionTitle>{t('profile.workWithUs')}</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow
          icon="car"
          title={dp ? t('profile.driverAccount') : t('profile.becomeDriver')}
          subtitle={dp ? undefined : t('profile.becomeDriverHint')}
          right={dp ? <StatusBadge status={dp.status} /> : undefined}
          onPress={() => router.push('/driver-apply')}
        />
        <ListRow
          icon="key"
          title={op ? t('profile.ownerAccount') : t('profile.becomeOwner')}
          subtitle={op ? undefined : t('profile.becomeOwnerHint')}
          right={op ? <StatusBadge status={op.status} /> : undefined}
          onPress={() => router.push('/owner-apply')}
        />
        <ListRow icon="document-text" title={t('documents.title')} onPress={() => router.push('/documents')} />
      </Card>

      <SectionTitle>{t('language.title')}</SectionTitle>
      <Segmented
        options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        value={(i18n.language as Language) ?? 'ar'}
        onChange={(l) => void changeLanguage(l)}
      />

      <SectionTitle>{t('profile.support')}</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow
          icon="call"
          title={t('profile.callSupport')}
          subtitle={config?.supportPhone}
          onPress={config?.supportPhone ? () => callPhone(config.supportPhone) : undefined}
        />
      </Card>

      <Button
        title={t('profile.logout')}
        variant="danger"
        icon="log-out"
        onPress={logout}
        style={{ marginTop: spacing.xl }}
      />
    </Screen>
  );
}
