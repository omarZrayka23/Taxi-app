import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/endpoints';
import type { Language } from '@/api/types';
import { useAuth } from '@/store/auth';
import { errorMessage, normalizeLebanesePhone } from '@/lib/format';
import { Banner, Button, Screen, TextField, Txt } from '@/components/ui';
import { spacing } from '@/theme';

export default function Register() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const normalized = normalizeLebanesePhone(phone);
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = t('auth.nameRequired');
    if (!normalized) errs.phone = t('auth.phoneInvalid');
    if (password.length < 6) errs.password = t('auth.passwordMin');
    setErrors(errs);
    if (Object.keys(errs).length || !normalized) return;
    setLoading(true);
    try {
      const lang: Language = i18n.language === 'en' ? 'en' : 'ar';
      const { token, user } = await authApi.register({
        name: name.trim(),
        phone: normalized,
        password,
        language: lang,
      });
      await useAuth.getState().signIn(token, user);
      router.replace(user.phoneVerified ? '/' : '/verify');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginBottom: spacing.xl }}>
        {t('auth.createAccount')}
      </Txt>
      {error ? <Banner tone="danger" message={error} icon="alert-circle" /> : null}
      <TextField label={t('auth.name')} value={name} onChangeText={setName} error={errors.name} autoComplete="name" />
      <TextField
        label={t('auth.phone')}
        placeholder={t('auth.phonePlaceholder')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={errors.phone}
        ltr
      />
      <Txt variant="small" style={{ marginTop: -8, marginBottom: spacing.md }}>
        {t('auth.phoneHint')}
      </Txt>
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        error={errors.password}
      />
      <Button title={t('auth.register')} onPress={submit} loading={loading} style={{ marginTop: spacing.md }} />
      <Button
        title={t('auth.haveAccount')}
        variant="ghost"
        onPress={() => router.replace('/login')}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}
