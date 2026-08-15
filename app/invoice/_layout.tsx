import { Stack } from 'expo-router';

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
      <Stack.Screen name="index" options={{ title: 'All Bills' }} />
      <Stack.Screen name="new" options={{ title: 'New Invoice', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Invoice' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit', presentation: 'modal' }} />
    </Stack>
  );
}
