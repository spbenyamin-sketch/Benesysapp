import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BarcodeScanner from '@/components/BarcodeScanner';
import Button from '@/components/Button';
import ItemPhoto from '@/components/ItemPhoto';
import SelectField from '@/components/SelectField';
import TextField from '@/components/TextField';
import { normaliseBarcode } from '@/modules/items/barcode';
import { captureItemPhoto, deleteItemPhoto, pickItemPhoto } from '@/modules/items/images';
import { createItem, findItemByBarcode, listCategories, updateItem } from '@/modules/items/service';
import { matchOption } from '@/modules/voice/match';
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
export default function ItemForm({
  item,
  /** A code scanned somewhere that matched no item, pre-filled on a new one. */
  initialBarcode,
}: {
  item?: Item;
  initialBarcode?: string;
}) {
  const router = useRouter();
  const editing = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [hsnCode, setHsnCode] = useState(item?.hsnCode ?? '');
  const [barcode, setBarcode] = useState(item?.barcode ?? initialBarcode ?? '');
  const [scanning, setScanning] = useState(false);
  // The name of the OTHER item already carrying this barcode, if there is one.
  // Shown, never enforced — two packets really can share a code (a refill and
  // its bottle), and the shop knows its own shelves better than the app does.
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [category, setCategory] = useState(item?.category ?? '');
  // Categories this shop has already used, so one typed for the last item is
  // waiting on the list for the next. The presets come after them: a shop that
  // has made its own names should see those first.
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [salePrice, setSalePrice] = useState(item ? paiseToRupeeInput(item.salePrice) : '');
  const [purchasePrice, setPurchasePrice] = useState(
    item ? paiseToRupeeInput(item.purchasePrice) : '',
  );
  const [taxRate, setTaxRate] = useState(item ? taxRateToInput(item.taxRate) : '');
  const [openingStock, setOpeningStock] = useState(item ? qtyToInput(item.openingStock) : '');
  // Reorder level. Blank means 0, which is what every item meant before this
  // existed: only an empty shelf counts as needing buying.
  const [minStock, setMinStock] = useState(item ? qtyToInput(item.minStock) : '');
  const [voiceAlias, setVoiceAlias] = useState(item?.voiceAlias ?? '');
  const [imageUri, setImageUri] = useState<string | null>(item?.imageUri ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    listCategories()
      .then((names) => active && setUsedCategories(names))
      // The presets alone still work; a category list is not worth an error.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    // This item's own category first, in case it was deleted from every other.
    for (const name of [category, ...usedCategories, ...ITEM_CATEGORIES]) {
      const trimmed = name.trim();
      if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
    }
    return [...seen.values()];
  }, [category, usedCategories]);

  // Photos are copied into the app's storage as soon as they are picked, so a
  // replaced/removed one is deleted right away — except the item's ORIGINAL
  // photo, which stays until the form is actually saved.
  const originalImage = item?.imageUri ?? null;

  const choosePhoto = async (source: () => Promise<string | null>) => {
    try {
      const uri = await source();
      if (!uri) return;
      if (imageUri && imageUri !== originalImage) deleteItemPhoto(imageUri);
      setImageUri(uri);
    } catch (e) {
      Alert.alert('No picture added', (e as Error)?.message ?? String(e));
    }
  };

  const checkBarcode = async (code: string) => {
    const other = await findItemByBarcode(code);
    setDuplicateOf(other && other.id !== item?.id ? other.name : null);
  };

  const removePhoto = () => {
    if (imageUri && imageUri !== originalImage) deleteItemPhoto(imageUri);
    setImageUri(null);
  };

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
        barcode: normaliseBarcode(barcode) || null,
        category: category.trim() || null,
        unit: unit.trim() || 'pcs',
        salePrice: parseRupeesToPaise(salePrice),
        purchasePrice: parseRupeesToPaise(purchasePrice),
        taxRate: parseTaxRateToBasisPoints(taxRate),
        openingStock: stock,
        minStock: parseQtyToThousandths(minStock),
        voiceAlias: voiceAlias.trim() || null,
        imageUri,
      };
      if (editing) {
        await updateItem(item.id, data);
        // Safe now that the row no longer points at it.
        if (originalImage && originalImage !== imageUri) deleteItemPhoto(originalImage);
      } else {
        await createItem({ ...data, currentStock: stock });
      }
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  // Voice: "பெயர் சர்க்கரை", "ரேட் நாற்பது", "வரி ஐந்து", "யூனிட் கிலோ",
  // "எச்எஸ்என் 1701", "இருப்பு ஐம்பது", "சேமி".
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
      case 'purchase':
        setPurchasePrice(intent.value);
        return true;
      case 'qty':
      case 'stock':
        setOpeningStock(intent.value);
        return true;
      case 'tax':
        setTaxRate(intent.value);
        return true;
      case 'hsn':
        setHsnCode(intent.value);
        return true;
      case 'unit':
        setUnit(matchOption(intent.value, ITEM_UNITS) ?? intent.value);
        return true;
      case 'category':
        // The shop's own categories are matched too, so saying one it invented
        // lands on that spelling instead of adding a near-identical twin.
        setCategory(matchOption(intent.value, categoryOptions) ?? intent.value);
        return true;
      case 'alias':
        setVoiceAlias(intent.value);
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
        <View style={styles.photoRow}>
          <ItemPhoto uri={imageUri} name={name || '?'} size={92} />
          <View style={styles.photoButtons}>
            <Text style={styles.photoLabel}>Picture</Text>
            <Text style={styles.hint}>
              Shown as a big button on the Quick Bill counter — tap the picture to add it.
            </Text>
            <View style={styles.photoActions}>
              <Pressable style={styles.photoBtn} onPress={() => choosePhoto(captureItemPhoto)}>
                <Text style={styles.photoBtnText}>📷  Camera</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => choosePhoto(pickItemPhoto)}>
                <Text style={styles.photoBtnText}>🖼  Gallery</Text>
              </Pressable>
            </View>
            {imageUri ? (
              <Pressable onPress={removePhoto} hitSlop={8}>
                <Text style={styles.photoRemove}>Remove picture</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

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
        <View style={styles.barcodeRow}>
          <View style={styles.col}>
            <TextField
              label="Barcode"
              value={barcode}
              onChangeText={setBarcode}
              placeholder="Scan or type"
              autoCapitalize="characters"
              onBlur={() => void checkBarcode(barcode)}
            />
          </View>
          <Pressable style={styles.scanBtn} onPress={() => setScanning(true)}>
            <Text style={styles.scanBtnText}>▥  Scan</Text>
          </Pressable>
        </View>
        {duplicateOf ? (
          <Text style={styles.warn}>
            "{duplicateOf}" already has this barcode. Scanning it will open that item instead.
          </Text>
        ) : null}

        <SelectField
          label="Category"
          value={category}
          onSelect={setCategory}
          options={categoryOptions}
          placeholder="Select or type a new category"
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
          label="Alert when stock reaches"
          value={minStock}
          onChangeText={setMinStock}
          placeholder="0"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          The item is flagged as running low at this quantity, so it can be reordered before the
          shelf is empty. Leave blank if only an empty shelf should count.
        </Text>
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

      <BarcodeScanner
        visible={scanning}
        onScan={(code) => {
          setScanning(false);
          setBarcode(code);
          void checkBarcode(code);
        }}
        onClose={() => setScanning(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  hint: { fontSize: 12, color: '#888', marginTop: -6 },
  warn: { fontSize: 12, color: '#d68910', marginTop: -6 },
  save: { marginTop: 8 },
  // The button sits on the input's baseline, below the field's own label.
  barcodeRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  scanBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  scanBtnText: { fontSize: 14, fontWeight: '600', color: '#208AEF' },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  photoButtons: { flex: 1, gap: 8 },
  photoLabel: { fontSize: 13, fontWeight: '600', color: '#444' },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  photoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: '#208AEF' },
  photoRemove: { fontSize: 13, color: '#c0392b', fontWeight: '600' },
});
