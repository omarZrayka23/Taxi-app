import { useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { documentsApi } from '@/api/endpoints';
import { qk, useDocuments } from '@/api/queries';
import type { Document, DocumentType, PickedFile } from '@/api/types';
import { fileUrl } from '@/config';
import { FileTooLargeError, pickDocumentFile, pickImages, takePhoto } from '@/lib/files';
import { errorMessage, formatDateTime } from '@/lib/format';
import { Button, Card, ErrorView, LoadingView, Row, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export const DRIVER_DOC_TYPES: DocumentType[] = [
  'ID_CARD',
  'DRIVER_LICENSE',
  'CAR_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
];
export const OWNER_DOC_TYPES: DocumentType[] = ['ID_CARD', 'BUSINESS_LICENSE'];
export const ALL_DOC_TYPES: DocumentType[] = [
  'ID_CARD',
  'DRIVER_LICENSE',
  'CAR_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
  'BUSINESS_LICENSE',
];

export function missingDocTypes(types: DocumentType[], docs: Document[] | undefined) {
  return types.filter((ty) => !docs?.some((d) => d.type === ty));
}

/** Lists required document types with upload status and an upload button per type. */
export function DocumentsChecklist({ types }: { types: DocumentType[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const docs = useDocuments();
  const [uploading, setUploading] = useState<DocumentType | null>(null);

  const upload = async (type: DocumentType, getFile: () => Promise<PickedFile | null>) => {
    try {
      const file = await getFile();
      if (!file) return;
      setUploading(type);
      await documentsApi.upload(type, file);
      await qc.invalidateQueries({ queryKey: qk.documents });
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof FileTooLargeError ? t('documents.tooLarge') : errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const chooseSource = (type: DocumentType) => {
    const sources = [
      { label: t('documents.camera'), fn: () => takePhoto() },
      { label: t('documents.gallery'), fn: async () => (await pickImages())[0] ?? null },
      { label: t('documents.file'), fn: () => pickDocumentFile() },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...sources.map((s) => s.label), t('common.cancel')], cancelButtonIndex: sources.length },
        (i) => {
          if (i < sources.length) void upload(type, sources[i].fn);
        },
      );
    } else {
      Alert.alert(t(`docType.${type}`), t('documents.chooseSource'), [
        ...sources.map((s) => ({ text: s.label, onPress: () => void upload(type, s.fn) })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ]);
    }
  };

  if (docs.isLoading) return <LoadingView />;
  if (docs.isError) return <ErrorView error={docs.error} onRetry={() => void docs.refetch()} />;

  return (
    <View>
      {types.map((type) => {
        const latest = [...(docs.data ?? [])]
          .filter((d) => d.type === type)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const isImage = latest && /\.(jpe?g|png|webp)$/i.test(latest.url);
        return (
          <Card key={type}>
            <Row gap={spacing.md}>
              {latest && isImage ? (
                <Image source={{ uri: fileUrl(latest.url) }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons
                    name={latest ? 'document-attach' : 'cloud-upload-outline'}
                    size={26}
                    color={latest ? colors.success : colors.textMuted}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '700' }}>{t(`docType.${type}`)}</Txt>
                <Txt variant="small" style={latest ? { color: colors.success } : undefined}>
                  {latest
                    ? t('documents.uploadedAt', { date: formatDateTime(latest.createdAt) })
                    : t('documents.missing')}
                </Txt>
              </View>
              <Button
                title={latest ? t('documents.replace') : t('documents.upload')}
                small
                variant={latest ? 'secondary' : 'primary'}
                loading={uploading === type}
                disabled={!!uploading && uploading !== type}
                onPress={() => chooseSource(type)}
              />
            </Row>
          </Card>
        );
      })}
      <Txt variant="small">{t('documents.formats')}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
});
