import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/store/auth';
import { errorMessage } from '@/lib/format';
import { Banner, Button, Screen, TextField, Txt } from '@/components/ui';
import { spacing } from '@/theme';

const RESEND_SECONDS = 30;

export default function Verify() {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const requested = useRef(false);

  const requestCode = useCallback(async () => {
    setError(null);
    try {
      const res = await authApi.requestOtp();
      setDevCode(res.devCode ?? null);
      setInfo(t('auth.codeSent'));
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [t]);

  useEffect(() => {
    if (status === 'signedIn' && user && !user.phoneVerified && !requested.current) {
      requested.current = true;
      void requestCode();
    }
  }, [status, user, requestCode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (user?.phoneVerified) return <Redirect href="/" />;

  const submit = async () => {
    if (code.trim().length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const { user: u } = await authApi.verifyOtp(code.trim());
      useAuth.getState().setUser(u);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Txt variant="muted" style={{ marginBottom: spacing.lg }}>
        {t('auth.verifySubtitle', { phone: user?.phone ?? '' })}
      </Txt>
      {devCode ? <Banner tone="warning" icon="bug" title={t('auth.devCode')} message={devCode} /> : null}
      {info && !error ? <Banner tone="info" message={info} /> : null}
      {error ? <Banner tone="danger" message={error} icon="alert-circle" /> : null}
      <TextField
        label={t('auth.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
        ltr
      />
      <Button title={t('auth.verify')} onPress={submit} loading={loading} disabled={code.length < 4} />
      <Button
        title={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
        variant="ghost"
        disabled={cooldown > 0}
        onPress={() => void requestCode()}
        style={{ marginTop: spacing.md }}
      />
      <Button
        title={t('auth.useAnotherAccount')}
        variant="ghost"
        onPress={async () => {
          await useAuth.getState().signOut();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
