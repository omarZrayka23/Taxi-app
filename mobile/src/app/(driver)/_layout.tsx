import { useTranslation } from 'react-i18next';
import { ModeTabs } from '@/components/TabsLayout';

export default function DriverLayout() {
  const { t } = useTranslation();
  return (
    <ModeTabs
      mode="driver"
      tabs={[
        { name: 'dashboard', title: t('tabs.drive'), icon: 'speedometer' },
        { name: 'earnings', title: t('tabs.earnings'), icon: 'wallet' },
        { name: 'trips', title: t('tabs.trips'), icon: 'list' },
        { name: 'driver-profile', title: t('tabs.profile'), icon: 'person' },
      ]}
    />
  );
}
