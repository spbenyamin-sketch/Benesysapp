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

// Like SelectField, but the options carry an id and the callback returns that id
// (SelectField only deals in strings). Used for the party/item pickers on the
// invoice + payment forms.
//
// Same bottom-sheet shape as SelectField: an explicit sheet height with a
// flex: 1 list inside, and no auto-focused search box — an auto-height sheet
// collapsed the list on Android and the keyboard covered whatever was left.
export interface PickerOption {
  id: number;
  label: string;
  sublabel?: string;
}

export default function PickerField({
  label,
  value,
  onSelect,
  options,
  placeholder = 'Select…',
  required = false,
  emptyText = 'Nothing to choose from yet.',
}: {
  label: string;
  value: number | null;
  onSelect: (id: number) => void;
  options: PickerOption[];
  placeholder?: string;
  required?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();
  const sheetHeight = Math.max(320, Math.min(620, Math.round(height * 0.78)));

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(term) : false),
    );
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (id: number) => {
    onSelect(id);
    close();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
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
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.id)}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const active = item.id === value;
                return (
                  <Pressable
                    style={[styles.option, active && styles.optionRowActive]}
                    onPress={() => choose(item.id)}
                  >
                    <View style={styles.optionLeft}>
                      <Text style={[styles.optionText, active && styles.optionActive]}>
                        {item.label}
                      </Text>
                      {item.sublabel ? <Text style={styles.sub}>{item.sublabel}</Text> : null}
                    </View>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>{options.length === 0 ? emptyText : 'No matches'}</Text>
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
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  optionRowActive: { backgroundColor: '#eef6ff' },
  optionLeft: { flexShrink: 1, gap: 2 },
  optionText: { fontSize: 17, color: '#222' },
  optionActive: { color: '#208AEF', fontWeight: '700' },
  sub: { fontSize: 13, color: '#888' },
  check: { color: '#208AEF', fontSize: 17, fontWeight: '700' },
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
