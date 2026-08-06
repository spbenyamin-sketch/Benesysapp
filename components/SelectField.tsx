import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

// Lightweight dropdown (no picker lib): a pressable that opens a searchable
// bottom sheet. With allowCustom, whatever the user types can be chosen too.
//
// The sheet is given an EXPLICIT height and the list inside it takes flex: 1.
// An auto-height sheet holding a FlatList collapses to almost nothing on some
// Android builds — the options were there but invisible. The search box is also
// no longer auto-focused: the keyboard used to open on top of the list and hide
// the very options the user came to pick.
export default function SelectField({
  label,
  value,
  onSelect,
  options,
  placeholder = 'Select…',
  required = false,
  searchable = true,
  allowCustom = false,
}: {
  label: string;
  value: string;
  onSelect: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();
  const sheetHeight = Math.max(320, Math.min(620, Math.round(height * 0.78)));

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.toLowerCase().includes(term));
  }, [options, query]);

  const trimmed = query.trim();
  const showCustom =
    allowCustom && trimmed.length > 0 && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (v: string) => {
    onSelect(v);
    close();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropFill} onPress={close} />
          <View style={[styles.sheet, { height: sheetHeight }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={allowCustom ? 'Search or type a new value' : 'Search'}
                placeholderTextColor="#aaa"
                autoCapitalize="none"
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                showCustom ? (
                  <Pressable style={styles.option} onPress={() => choose(trimmed)}>
                    <Text style={styles.customText}>＋  Use “{trimmed}”</Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => {
                const active = item === value;
                return (
                  <Pressable
                    style={[styles.option, active && styles.optionRowActive]}
                    onPress={() => choose(item)}
                  >
                    <Text style={[styles.optionText, active && styles.optionActive]}>{item}</Text>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                showCustom ? null : <Text style={styles.emptyText}>No matches</Text>
              }
            />
            <Pressable style={styles.closeBtn} onPress={close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#444' },
  req: { color: '#c0392b' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  value: { fontSize: 16, color: '#111', flexShrink: 1 },
  placeholder: { color: '#aaa' },
  chevron: { fontSize: 14, color: '#888', marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  backdropFill: { flex: 1 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ddd',
    marginBottom: 2,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  search: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  // flex: 1 inside a fixed-height sheet — the list always gets real space.
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  optionRowActive: { backgroundColor: '#eef6ff' },
  // flexShrink lets a long option wrap onto a second line (the row has a
  // minHeight, not a fixed one). Without it Android hands the Text its full
  // measured width and simply clips whatever runs past the row — names like
  // "Apparel & Textiles" lost their tail instead of wrapping.
  optionText: { fontSize: 17, color: '#222', flexShrink: 1 },
  optionActive: { color: '#208AEF', fontWeight: '700' },
  customText: { fontSize: 17, color: '#208AEF', fontWeight: '700', flexShrink: 1 },
  check: { color: '#208AEF', fontSize: 17, fontWeight: '700', marginLeft: 10 },
  emptyText: { color: '#999', textAlign: 'center', paddingVertical: 24 },
  closeBtn: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15, fontWeight: '700', color: '#555' },
});
