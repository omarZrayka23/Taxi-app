import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { usePlaces } from '@/api/queries';
import type { Place } from '@/api/types';
import { placeName } from '@/lib/format';
import { EmptyView, ErrorView, IconButton, LoadingView, Row, TextField, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Normalize Arabic/English text for searching (case, diacritics, alef/ya/ta-marbuta variants). */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

export function PlacePickerModal({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (p: Place) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const places = usePlaces();

  const filtered = useMemo(() => {
    const list = places.data ?? [];
    const nq = norm(q);
    if (!nq) return list;
    return list.filter((p) => norm(p.nameAr).includes(nq) || norm(p.nameEn).includes(nq));
  }, [places.data, q]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Row style={styles.header}>
          <IconButton icon="close" onPress={onClose} label={t('common.close')} />
          <Txt variant="subtitle" style={{ flex: 1, textAlign: 'center' }}>
            {title}
          </Txt>
          <View style={{ width: 34 }} />
        </Row>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TextField placeholder={t('places.search')} value={q} onChangeText={setQ} autoFocus />
        </View>
        {places.isLoading ? (
          <LoadingView />
        ) : places.isError ? (
          <ErrorView error={places.error} onRetry={() => void places.refetch()} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => String(p.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyView title={t('places.none')} icon="location-outline" />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setQ('');
                }}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surface }]}
              >
                <Ionicons name="location" size={20} color={colors.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>{placeName(item)}</Txt>
                  <Txt variant="small">{item.nameEn === placeName(item) ? item.nameAr : item.nameEn}</Txt>
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
