import { useTranslation } from 'react-i18next';
import { ModeTabs } from '@/components/TabsLayout';

export default function PassengerLayout() {
  const { t } = useTranslation();
  return (
    <ModeTabs
      mode="passenger"
      tabs={[
        { name: 'home', title: t('tabs.ride'), icon: 'car', headerShown: false },
        { name: 'rentals', title: t('tabs.rentals'), icon: 'key' },
        { name: 'activity', title: t('tabs.activity'), icon: 'time' },
        { name: 'profile', title: t('tabs.profile'), icon: 'person' },
      ]}
    />
  );
}
