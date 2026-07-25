import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import ItemForm from '@/modules/items/ItemForm';
import { getItem } from '@/modules/items/service';
import type { Item } from '@/db/schema';

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const [item, setItem] = useState<Item | null | undefined>(undefined);

  useEffect(() => {
    getItem(itemId).then((i) => setItem(i ?? null));
  }, [itemId]);

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Item not found.</Text>
      </View>
    );
  }
  return <ItemForm item={item} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
