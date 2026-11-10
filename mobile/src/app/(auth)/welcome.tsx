import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, Spacer, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export default function Welcome() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'bottom']} style={{ backgroundColor: colors.primary }}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={64} color={colors.text} />
        </View>
        <Txt variant="title" style={{ fontSize: 34, textAlign: 'center' }}>
          {t('app.name')}
        </Txt>
        <Txt style={{ textAlign: 'center', marginTop: spacing.sm, fontSize: 17 }}>{t('app.tagline')}</Txt>
      </View>
      <View>
        <Button title={t('auth.login')} onPress={() => router.push('/login')} variant="dark" />
        <Spacer />
        <Button title={t('auth.createAccount')} onPress={() => router.push('/register')} variant="secondary" />
        <Spacer />
        <Button title={t('language.change')} icon="language" variant="ghost" onPress={() => router.push('/language')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
});
