import { Stack } from 'expo-router';

// The party module runs its own header-ful stack (the root stack hides headers).
export default function PartyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="new" options={{ title: 'New Party', presentation: 'modal' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Party' }} />
      <Stack.Screen name="[id]" options={{ title: 'Party' }} />
    </Stack>
  );
}
