import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import SelectField from '@/components/SelectField';
import TextField from '@/components/TextField';
import { createItem, updateItem } from '@/modules/items/service';
import { useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { ITEM_CATEGORIES, ITEM_UNITS } from '@/utils/constants';
import {
  paiseToRupeeInput,
  parseQtyToThousandths,
  parseRupeesToPaise,
  parseTaxRateToBasisPoints,
  qtyToInput,
  taxRateToInput,
} from '@/utils/format';
import type { Item } from '@/db/schema';

// Shared by the "new" and "edit" item routes. On create, currentStock is seeded
// from openingStock; on edit, currentStock is left untouched (the Adjust-stock
// screen owns it). Navigates back on success.
export default function ItemForm({ item }: { item?: Item }) {
  const router = useRouter();
  const editing = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [hsnCode, setHsnCode] = useState(item?.hsnCode ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [salePrice, setSalePrice] = useState(item ? paiseToRupeeInput(item.salePrice) : '');
  const [purchasePrice, setPurchasePrice] = useState(
    item ? paiseToRupeeInput(item.purchasePrice) : '',
  );
  const [taxRate, setTaxRate] = useState(item ? taxRateToInput(item.taxRate) : '');
  const [openingStock, setOpeningStock] = useState(item ? qtyToInput(item.openingStock) : '');
  const [voiceAlias, setVoiceAlias] = useState(item?.voiceAlias ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter the item name.');
      return;
    }
    setSaving(true);
    try {
      const stock = parseQtyToThousandths(openingStock);
      const data = {
        name: trimmedName,
        hsnCode: hsnCode.trim() || null,
        category: category.trim() || null,
        unit: unit.trim() || 'pcs',
        salePrice: parseRupeesToPaise(salePrice),
        purchasePrice: parseRupeesToPaise(purchasePrice),
        taxRate: parseTaxRateToBasisPoints(taxRate),
        openingStock: stock,
        voiceAlias: voiceAlias.trim() || null,
      };
      if (editing) {
        await updateItem(item.id, data);
      } else {
        await createItem({ ...data, currentStock: stock });
      }
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  // Voice: "பெயர் சர்க்கரை", "ரேட் நாற்பது", "வரி ஐந்து", "சேமி".
  useVoiceCommands((intent) => {
    if (intent.kind === 'submit') {
      void save();
      return true;
    }
    if (intent.kind !== 'setField') return false;
    switch (intent.field) {
      case 'name':
        setName(intent.value);
        return true;
      case 'rate':
      case 'amount':
        setSalePrice(intent.value);
        return true;
      case 'qty':
        setOpeningStock(intent.value);
        return true;
      case 'tax':
        setTaxRate(intent.value);
        return true;
      default:
        return false;
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Item name" required />
        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label="HSN / SAC code"
              value={hsnCode}
              onChangeText={setHsnCode}
              placeholder="e.g. 6109"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.col}>
            <SelectField
              label="Unit"
              value={unit}
              onSelect={setUnit}
              options={ITEM_UNITS}
              placeholder="Select unit"
              allowCustom
            />
          </View>
        </View>
        <SelectField
          label="Category"
          value={category}
          onSelect={setCategory}
          options={ITEM_CATEGORIES}
          placeholder="Select category"
          allowCustom
        />
        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label="Sale price (₹)"
              value={salePrice}
              onChangeText={setSalePrice}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.col}>
            <TextField
              label="Purchase price (₹)"
              value={purchasePrice}
              onChangeText={setPurchasePrice}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <TextField
              label="Tax rate (%)"
              value={taxRate}
              onChangeText={setTaxRate}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.col}>
            <TextField
              label="Opening stock"
              value={openingStock}
              onChangeText={setOpeningStock}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>
        </View>
        <TextField
          label="Voice name (தமிழ்)"
          value={voiceAlias}
          onChangeText={setVoiceAlias}
          placeholder="e.g. சர்க்கரை, sakkarai"
        />
        <Text style={styles.hint}>
          What you actually SAY for this item when billing by voice. Add several, comma separated —
          Tamil spelling, nickname, short form. Leave blank to match on the name above.
        </Text>

        {editing ? (
          <Text style={styles.hint}>
            Editing opening stock won't change current stock — use "Adjust stock" for that.
          </Text>
        ) : null}

        <Button
          label={editing ? 'Save changes' : 'Add item'}
          onPress={save}
          loading={saving}
          style={styles.save}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  hint: { fontSize: 12, color: '#888', marginTop: -6 },
  save: { marginTop: 8 },
});
