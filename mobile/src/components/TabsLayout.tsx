import React from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { effectiveMode, useAuth, type AppMode } from '@/store/auth';
import { colors } from '@/theme';
import type { IconName } from './ui';

export interface TabDef {
  name: string;
  title: string;
  icon: IconName;
  headerShown?: boolean;
}

/** Bottom tabs for one app mode; redirects to the entry route when the mode is not (or no longer) allowed. */
export function ModeTabs({ mode, tabs }: { mode: AppMode; tabs: TabDef[] }) {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const selected = useAuth((s) => s.mode);

  if (status === 'signedOut' || (status === 'signedIn' && !user)) return <Redirect href="/welcome" />;
  if (status === 'signedIn' && user && effectiveMode(user, selected) !== mode) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerTitleAlign: 'center',
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarActiveBackgroundColor: colors.primaryLight,
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerShown: tab.headerShown ?? true,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
