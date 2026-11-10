import { useTranslation } from 'react-i18next';
import { ModeTabs } from '@/components/TabsLayout';

export default function OwnerLayout() {
  const { t } = useTranslation();
  return (
    <ModeTabs
      mode="owner"
      tabs={[
        { name: 'listings', title: t('tabs.myCars'), icon: 'car-sport' },
        { name: 'requests', title: t('tabs.requests'), icon: 'calendar' },
        { name: 'owner-profile', title: t('tabs.profile'), icon: 'person' },
      ]}
    />
  );
}
