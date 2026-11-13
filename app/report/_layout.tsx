import { Stack } from 'expo-router';
import { t } from '@/i18n';

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
      <Stack.Screen name="daybook" options={{ title: t('Day Book') }} />
      <Stack.Screen name="sales" options={{ title: t('Sale Report') }} />
      <Stack.Screen name="itemsales" options={{ title: t('Item-wise Sales') }} />
      <Stack.Screen name="purchase" options={{ title: t('Purchase Report') }} />
      <Stack.Screen name="outstanding" options={{ title: t('Party Outstanding') }} />
      <Stack.Screen name="aging" options={{ title: t('Aging') }} />
      <Stack.Screen name="stock" options={{ title: t('Stock Summary') }} />
      <Stack.Screen name="profit" options={{ title: t('Profit Report') }} />
      <Stack.Screen name="gst" options={{ title: t('GST Summary') }} />
      <Stack.Screen name="tally" options={{ title: t('Tally Export') }} />
    </Stack>
  );
}
