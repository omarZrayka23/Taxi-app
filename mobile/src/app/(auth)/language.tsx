import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Language } from '@/api/types';
import { authApi } from '@/api/endpoints';
import { LANGUAGES, deviceLanguage, setLanguage } from '@/i18n';
import { useAuth } from '@/store/auth';
import { Badge, Card, Row, Screen, Txt } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const suggested = deviceLanguage();

  const choose = async (code: Language) => {
    if (busy) return;
    setBusy(true);
    try {
      if (useAuth.getState().status === 'signedIn') {
        await authApi.updateMe({ language: code }).catch(() => undefined);
      }
      await setLanguage(code); // may reload the app when direction changes
      if (router.canGoBack()) router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Txt variant="muted" style={{ marginBottom: 16 }}>
        {t('language.subtitle')}
      </Txt>
      {LANGUAGES.map((l) => (
        <Card key={l.code} onPress={() => void choose(l.code)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row>
              <Txt variant="subtitle">{l.label}</Txt>
              {l.code === suggested ? <Badge label={t('language.deviceLanguage')} tone="info" /> : null}
            </Row>
            {i18n.language === l.code ? <Ionicons name="checkmark-circle" size={24} color={colors.success} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
