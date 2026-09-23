import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import HeaderSignOut from '@/components/HeaderSignOut';
import { useAllowedScreens } from '@/modules/auth/allowed';
import { SCREEN_LABEL, SCREENS, type Screen } from '@/modules/auth/screens';

// Emoji tab icons keep Phase 0 dependency-free; swap for a vector icon set later if desired.
function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

// Keyed by Screen, so a tab the owner can tick always has a place on the bar
// and one that has no tab cannot be invented. Settings is the exception: it is
// not a Screen, because everybody keeps it to sign out with.
const TAB_ICON: Record<Screen, string> = {
  dashboard: '📊',
  quickbill: '🧾',
  parties: '👥',
  items: '📦',
  reports: '📈',
};

export default function TabsLayout() {
  // Offline mode always returns every screen; Online mode, what the owner gave
  // this account. Settings is not one of them — everybody needs it to sign out.
  const allowed = useAllowedScreens();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#208AEF',
        tabBarInactiveTintColor: '#999',
        // Nothing at all on the phone — see components/HeaderSignOut.tsx.
        headerRight: () => <HeaderSignOut />,
      }}
    >
      {SCREENS.map((screen) => (
        <Tabs.Screen
          key={screen}
          name={screen}
          options={{
            title: SCREEN_LABEL[screen],
            tabBarIcon: ({ color }) => <TabIcon emoji={TAB_ICON[screen]} color={color} />,
            // `null` keeps the route registered but off the bar, so the address
            // still resolves and ScreenGuard is the one that turns it away.
            href: allowed.includes(screen) ? undefined : null,
          }}
        />
      ))}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
