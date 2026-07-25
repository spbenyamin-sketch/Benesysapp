import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// Like SelectField, but the options carry an id and the callback returns that id
// (SelectField only deals in strings). Used for the party/item pickers on the
// invoice + payment forms.
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#aaa"
              autoFocus
            />
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.id)}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                const active = item.id === value;
                return (
                  <Pressable style={styles.option} onPress={() => choose(item.id)}>
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
          </Pressable>
        </Pressable>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 16, maxHeight: '70%', gap: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  search: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  optionLeft: { flexShrink: 1, gap: 2 },
  optionText: { fontSize: 16, color: '#222' },
  optionActive: { color: '#208AEF', fontWeight: '600' },
  sub: { fontSize: 13, color: '#888' },
  check: { color: '#208AEF', fontSize: 16, fontWeight: '700' },
  emptyText: { color: '#999', textAlign: 'center', paddingVertical: 16 },
});
