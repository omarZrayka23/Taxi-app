import { useState, type FormEvent } from 'react';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconAlertCircle, IconRoad } from '@tabler/icons-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../api/client';
import { NotAdminError, useAuth } from '../auth/AuthContext';

function loginErrorText(err: unknown): string {
  if (err instanceof NotAdminError) return err.message;
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Wrong phone number or password.';
    if (err.code === 'USER_BLOCKED') return 'This account is blocked.';
  }
  return errorMessage(err);
}

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(loginErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" radius="lg" p="xl" w="100%" maw={400}>
        <form onSubmit={onSubmit}>
          <Stack>
            <Stack gap={4} align="center">
              <ThemeIcon size={48} radius="xl" color="yellow">
                <IconRoad size={28} />
              </ThemeIcon>
              <Title order={3}>Cedra Admin</Title>
              <Text size="sm" c="dimmed">
                Sign in with an administrator account
              </Text>
            </Stack>
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={18} />}>
                {error}
              </Alert>
            )}
            <TextInput
              label="Phone"
              placeholder="03 123 456"
              required
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              autoComplete="username"
              type="tel"
            />
            <PasswordInput
              label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
            />
            <Button type="submit" loading={loading} fullWidth>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
