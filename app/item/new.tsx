import { useLocalSearchParams } from 'expo-router';
import ItemForm from '@/modules/items/ItemForm';

export default function NewItemScreen() {
  // A scan that matched nothing lands here carrying its code, so the shop turns
  // the packet into an item without reading the digits off it by hand.
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  return <ItemForm initialBarcode={barcode} />;
}
