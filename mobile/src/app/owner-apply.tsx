import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ownerApi } from '@/api/endpoints';
import { useDocuments } from '@/api/queries';
import { useAuth } from '@/store/auth';
import { errorMessage } from '@/lib/format';
import { DocumentsChecklist, OWNER_DOC_TYPES, missingDocTypes } from '@/components/DocumentsChecklist';
import {
  Banner,
  Button,
  Card,
  KeyValue,
  Screen,
  SectionTitle,
  Segmented,
  StatusBadge,
  TextField,
  Txt,
} from '@/components/ui';
import { spacing } from '@/theme';

type ApplyType = 'INDIVIDUAL' | 'AGENCY';

export default function OwnerApply() {
  const { t } = useTranslation();
  const op = useAuth((s) => s.user?.ownerProfile ?? null);
  const docs = useDocuments();
  const missing = missingDocTypes(OWNER_DOC_TYPES, docs.data);
  const [type, setType] = useState<ApplyType>(op?.type === 'AGENCY' ? 'AGENCY' : 'INDIVIDUAL');
  const [businessName, setBusinessName] = useState(op?.businessName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showForm = !op || op.status === 'REJECTED';

  const submit = async () => {
    if (type === 'AGENCY' && !businessName.trim()) {
      setNameError(t('common.required'));
      return;
    }
    setNameError(null);
    setLoading(true);
    setError(null);
    try {
      const { ownerProfile } = await ownerApi.apply({
        type,
        businessName: businessName.trim() || undefined,
      });
      useAuth.getState().setOwnerProfile(ownerProfile);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      {op ? (
        <>
          <Banner
            tone={op.status === 'APPROVED' ? 'success' : op.status === 'PENDING' ? 'warning' : 'danger'}
            icon={
              op.status === 'APPROVED' ? 'checkmark-circle' : op.status === 'PENDING' ? 'hourglass' : 'alert-circle'
            }
            title={t(`ownerApply.status.${op.status}`)}
            message={
              op.status === 'REJECTED'
                ? (op.rejectionReason ?? undefined)
                : t(`ownerApply.statusHint.${op.status}`, { defaultValue: '' }) || undefined
            }
          />
          <Card>
            <KeyValue label={t('driverApply.status.label')} value={<StatusBadge status={op.status} />} />
            <KeyValue label={t('ownerApply.type')} value={t(`ownerType.${op.type}`)} />
            {op.businessName ? <KeyValue label={t('ownerApply.businessName')} value={op.businessName} /> : null}
          </Card>
          {op.status === 'APPROVED' ? (
            <Button
              title={t('ownerApply.switchToOwner')}
              icon="car-sport"
              onPress={async () => {
                await useAuth.getState().setMode('owner');
                router.replace('/');
              }}
            />
          ) : null}
        </>
      ) : (
        <Txt variant="muted">{t('ownerApply.intro')}</Txt>
      )}

      {showForm ? (
        <>
          <SectionTitle>{t('ownerApply.type')}</SectionTitle>
          <Segmented<ApplyType>
            options={[
              { value: 'INDIVIDUAL', label: t('ownerType.INDIVIDUAL') },
              { value: 'AGENCY', label: t('ownerType.AGENCY') },
            ]}
            value={type}
            onChange={setType}
          />
          <Txt variant="small" style={{ marginVertical: spacing.sm }}>
            {type === 'AGENCY' ? t('ownerApply.agencyHint') : t('ownerApply.individualHint')}
          </Txt>
          <TextField
            label={type === 'AGENCY' ? t('ownerApply.businessName') : t('ownerApply.businessNameOptional')}
            value={businessName}
            onChangeText={setBusinessName}
            error={nameError}
          />
          {error ? <Banner tone="danger" icon="alert-circle" message={error} /> : null}
          <Button title={t('ownerApply.submit')} onPress={submit} loading={loading} />
        </>
      ) : null}

      {op ? (
        <>
          <SectionTitle>{t('documents.title')}</SectionTitle>
          {missing.length && !docs.isLoading ? (
            <Banner
              tone="warning"
              icon="alert-circle"
              message={t('documents.missingCount', { count: missing.length })}
            />
          ) : null}
          <DocumentsChecklist types={OWNER_DOC_TYPES} />
        </>
      ) : null}
    </Screen>
  );
}
