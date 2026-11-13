import { Stack } from 'expo-router';
import { t } from '@/i18n';

// The invoice module runs its own header-ful stack (the root stack hides headers).
export default function InvoiceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('All Bills') }} />
      <Stack.Screen name="new" options={{ title: t('New Invoice'), presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: t('Invoice') }} />
      <Stack.Screen name="edit/[id]" options={{ title: t('Edit'), presentation: 'modal' }} />
    </Stack>
  );
}
