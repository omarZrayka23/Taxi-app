import { Redirect } from 'expo-router';
import { useAuth, effectiveMode } from '@/store/auth';
import { ErrorView, LoadingView, Screen } from '@/components/ui';
import { ApiError, NETWORK_ERROR } from '@/api/client';

/** Entry point: sends the user to auth, phone verification or the home of the selected mode. */
export default function Index() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const mode = useAuth((s) => s.mode);
  const bootError = useAuth((s) => s.bootError);
  const bootstrap = useAuth((s) => s.bootstrap);

  if (bootError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ErrorView error={new ApiError(0, NETWORK_ERROR, '')} onRetry={() => void bootstrap()} />
      </Screen>
    );
  }
  if (status === 'loading') return <LoadingView />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  if (!user.phoneVerified) return <Redirect href="/verify" />;

  const m = effectiveMode(user, mode);
  if (m === 'driver') return <Redirect href="/dashboard" />;
  if (m === 'owner') return <Redirect href="/listings" />;
  return <Redirect href="/home" />;
}
