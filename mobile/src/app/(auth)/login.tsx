import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/store/auth';
import { errorMessage, normalizeLebanesePhone } from '@/lib/format';
import { Banner, Button, Screen, TextField, Txt } from '@/components/ui';
import { spacing } from '@/theme';

export default function Login() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const normalized = normalizeLebanesePhone(phone);
    setPhoneError(normalized ? null : t('auth.phoneInvalid'));
    if (!normalized || !password) return;
    setLoading(true);
    try {
      const { token, user } = await authApi.login({ phone: normalized, password });
      await useAuth.getState().signIn(token, user);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginBottom: spacing.xl }}>
        {t('auth.welcomeBack')}
      </Txt>
      {error ? <Banner tone="danger" message={error} icon="alert-circle" /> : null}
      <TextField
        label={t('auth.phone')}
        placeholder={t('auth.phonePlaceholder')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={phoneError}
        ltr
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={submit}
      />
      <Button title={t('auth.login')} onPress={submit} loading={loading} style={{ marginTop: spacing.md }} />
      <Button
        title={t('auth.noAccount')}
        variant="ghost"
        onPress={() => router.replace('/register')}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}
