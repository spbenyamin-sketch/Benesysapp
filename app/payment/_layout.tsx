import { Stack } from 'expo-router';

// The payment module runs its own header-ful stack (the root stack hides headers).
export default function PaymentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Payments' }} />
      <Stack.Screen name="new" options={{ title: 'Record Payment', presentation: 'modal' }} />
    </Stack>
  );
}
