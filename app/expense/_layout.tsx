import { Stack } from 'expo-router';

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
      <Stack.Screen name="index" options={{ title: 'Expenses' }} />
      <Stack.Screen name="new" options={{ title: 'Add Expense', presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Expense' }} />
    </Stack>
  );
}
