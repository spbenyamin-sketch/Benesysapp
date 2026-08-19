import { Stack } from 'expo-router';

// Reports run in their own header-ful stack (the root stack hides headers).
export default function ReportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#208AEF',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="daybook" options={{ title: 'Day Book' }} />
      <Stack.Screen name="sales" options={{ title: 'Sale Report' }} />
      <Stack.Screen name="itemsales" options={{ title: 'Item-wise Sales' }} />
      <Stack.Screen name="purchase" options={{ title: 'Purchase Report' }} />
      <Stack.Screen name="outstanding" options={{ title: 'Party Outstanding' }} />
      <Stack.Screen name="aging" options={{ title: 'Receivables Aging' }} />
      <Stack.Screen name="stock" options={{ title: 'Stock Summary' }} />
      <Stack.Screen name="profit" options={{ title: 'Profit Report' }} />
      <Stack.Screen name="gst" options={{ title: 'GST Summary' }} />
    </Stack>
  );
}
