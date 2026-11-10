import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { DocumentType } from '@/api/types';
import { useAuth } from '@/store/auth';
import { ALL_DOC_TYPES, DRIVER_DOC_TYPES, DocumentsChecklist, OWNER_DOC_TYPES } from '@/components/DocumentsChecklist';
import { Screen, Txt } from '@/components/ui';
import { spacing } from '@/theme';

/** Upload screen. `?types=A,B` limits the list (e.g. DRIVER_LICENSE for self-drive rentals). */
export default function DocumentsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ types?: string }>();
  const user = useAuth((s) => s.user);

  let types: DocumentType[];
  if (params.types) {
    types = params.types.split(',').filter((x): x is DocumentType => ALL_DOC_TYPES.includes(x as DocumentType));
  } else {
    const set = new Set<DocumentType>(['DRIVER_LICENSE']);
    if (user?.driverProfile) DRIVER_DOC_TYPES.forEach((d) => set.add(d));
    if (user?.ownerProfile) OWNER_DOC_TYPES.forEach((d) => set.add(d));
    types = ALL_DOC_TYPES.filter((d) => set.has(d));
  }

  return (
    <Screen scroll>
      <Txt variant="muted" style={{ marginBottom: spacing.md }}>
        {t('documents.subtitle')}
      </Txt>
      <DocumentsChecklist types={types} />
    </Screen>
  );
}
