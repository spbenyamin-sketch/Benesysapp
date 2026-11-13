import { Stack } from 'expo-router';
import { t } from '@/i18n';

// Cash & bank runs its own header-ful stack (the root stack hides headers).
export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('Cash & Bank') }} />
      <Stack.Screen name="new" options={{ title: t('New Account'), presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: t('Edit Account') }} />
    </Stack>
  );
}
