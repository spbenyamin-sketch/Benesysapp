import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// Lightweight dropdown (no picker lib): a pressable that opens a searchable
// modal list. With allowCustom, whatever the user types can be chosen too.
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={allowCustom ? 'Search or type a new value' : 'Search'}
                placeholderTextColor="#aaa"
                autoFocus
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListHeaderComponent={
                showCustom ? (
                  <Pressable style={styles.option} onPress={() => choose(trimmed)}>
                    <Text style={styles.customText}>Use “{trimmed}”</Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => {
                const active = item === value;
                return (
                  <Pressable style={styles.option} onPress={() => choose(item)}>
                    <Text style={[styles.optionText, active && styles.optionActive]}>{item}</Text>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                showCustom ? null : <Text style={styles.emptyText}>No matches</Text>
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
  },
  optionText: { fontSize: 16, color: '#222' },
  optionActive: { color: '#208AEF', fontWeight: '600' },
  customText: { fontSize: 16, color: '#208AEF', fontWeight: '600' },
  check: { color: '#208AEF', fontSize: 16, fontWeight: '700' },
  emptyText: { color: '#999', textAlign: 'center', paddingVertical: 16 },
});
