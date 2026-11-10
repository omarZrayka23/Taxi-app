import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DriversPage from './pages/DriversPage';
import OwnersPage from './pages/OwnersPage';
import ListingsPage from './pages/ListingsPage';
import RidesPage from './pages/RidesPage';
import BookingsPage from './pages/BookingsPage';
import PricingPage from './pages/PricingPage';
import PlacesPage from './pages/PlacesPage';
import RouteFaresPage from './pages/RouteFaresPage';
import BillingPage from './pages/BillingPage';
import BillingAccountPage from './pages/BillingAccountPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="owners" element={<OwnersPage />} />
        <Route path="listings" element={<ListingsPage />} />
        <Route path="rides" element={<RidesPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="places" element={<PlacesPage />} />
        <Route path="route-fares" element={<RouteFaresPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/:userId" element={<BillingAccountPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
