import { Stack } from 'expo-router';

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
      <Stack.Screen name="index" options={{ title: 'Cash & Bank' }} />
      <Stack.Screen name="new" options={{ title: 'New Account', presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Account' }} />
    </Stack>
  );
}
