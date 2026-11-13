import { Stack } from 'expo-router';
import { t } from '@/i18n';

// The item module runs its own header-ful stack (the root stack hides headers).
export default function ItemLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="new" options={{ title: t('New Item'), presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: t('Edit Item') }} />
      <Stack.Screen name="adjust/[id]" options={{ title: t('Adjust Stock'), presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: t('Item') }} />
    </Stack>
  );
}
