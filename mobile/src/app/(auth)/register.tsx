import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/endpoints';
import type { Gender, Language } from '@/api/types';
import { useAuth } from '@/store/auth';
import { errorMessage, normalizeLebanesePhone } from '@/lib/format';
import { Banner, Button, Chip, Row, Screen, TextField, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function Register() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; password?: string; gender?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const normalized = normalizeLebanesePhone(phone);
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = t('auth.nameRequired');
    if (!normalized) errs.phone = t('auth.phoneInvalid');
    if (password.length < 6) errs.password = t('auth.passwordMin');
    if (!gender) errs.gender = t('gender.required');
    setErrors(errs);
    if (Object.keys(errs).length || !normalized || !gender) return;
    setLoading(true);
    try {
      const lang: Language = i18n.language === 'en' ? 'en' : 'ar';
      const { token, user } = await authApi.register({
        name: name.trim(),
        phone: normalized,
        password,
        gender,
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
      <Txt style={{ fontWeight: '600', marginBottom: spacing.xs }}>{t('gender.label')}</Txt>
      <Row gap={spacing.sm}>
        {(['MALE', 'FEMALE'] as const).map((g) => (
          <Chip key={g} label={t(`gender.${g}`)} selected={gender === g} onPress={() => setGender(g)} />
        ))}
      </Row>
      <Txt variant="small" style={{ color: colors.danger, marginBottom: spacing.md, minHeight: 4 }}>
        {errors.gender ?? ''}
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
