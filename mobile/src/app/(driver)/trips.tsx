import { useTranslation } from 'react-i18next';
import { driverApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import type { Ride } from '@/api/types';
import { PagedList, RideHistoryCard } from '@/components/lists';

export default function DriverTrips() {
  const { t } = useTranslation();
  return (
    <PagedList<Ride>
      queryKey={qk.driverRides}
      fetchPage={(p) => driverApi.rides(p)}
      renderItem={(r) => <RideHistoryCard ride={r} perspective="driver" />}
      emptyTitle={t('activity.noRides')}
      emptyIcon="car-outline"
    />
  );
}
