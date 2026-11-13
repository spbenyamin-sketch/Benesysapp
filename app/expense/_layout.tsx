import { Stack } from 'expo-router';
import { t } from '@/i18n';

// The expense module runs its own header-ful stack (the root stack hides headers).
export default function ExpenseLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('Expenses') }} />
      <Stack.Screen name="new" options={{ title: t('Add Expense'), presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: t('Edit Expense') }} />
    </Stack>
  );
}
