import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const REPORTS: { href: Href; emoji: string; title: string; sub: string }[] = [
  {
    href: '/report/daybook',
    emoji: '📒',
    title: 'Day Book',
    sub: 'Everything that happened on one day',
  },
  { href: '/report/sales', emoji: '🧾', title: 'Sale Report', sub: 'Sales over a date range' },
  {
    href: '/report/itemsales',
    emoji: '🏆',
    title: 'Item-wise Sales',
    sub: 'What sells, by quantity and value',
  },
  {
    href: '/report/purchase',
    emoji: '🛒',
    title: 'Purchase Report',
    sub: 'What was bought, and from whom',
  },
  {
    href: '/report/profit',
    emoji: '📈',
    title: 'Profit Report',
    sub: 'Sales minus cost and expenses, item-wise',
  },
  {
    href: '/report/outstanding',
    emoji: '💰',
    title: 'Party Outstanding',
    sub: 'Who owes you, who you owe',
  },
  {
    href: '/report/aging',
    emoji: '⏳',
    title: 'Receivables Aging',
    sub: 'How long the money has been owed, and who to remind',
  },
  { href: '/report/stock', emoji: '📦', title: 'Stock Summary', sub: 'On-hand quantity and value' },
  { href: '/report/gst', emoji: '🧮', title: 'GST Summary', sub: 'Output vs input tax' },
  {
    href: '/payment',
    emoji: '💵',
    title: 'Payment History',
    sub: 'Every payment in and out',
  },
  {
    href: '/expense',
    emoji: '💸',
    title: 'Expenses',
    sub: 'Rent, power, wages and other overheads',
  },
];

export default function ReportsScreen() {
  const router = useRouter();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {REPORTS.map((r) => (
        <Pressable key={r.title} style={styles.card} onPress={() => router.push(r.href)}>
          <Text style={styles.emoji}>{r.emoji}</Text>
          <View style={styles.cardText}>
            <Text style={styles.title}>{r.title}</Text>
            <Text style={styles.sub}>{r.sub}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    backgroundColor: '#fafafa',
  },
  emoji: { fontSize: 26 },
  cardText: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '600', color: '#111' },
  sub: { fontSize: 13, color: '#888' },
  chevron: { fontSize: 22, color: '#ccc' },
});
