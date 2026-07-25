import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import Button from '@/components/Button';
import SelectField from '@/components/SelectField';
import TextField from '@/components/TextField';
import { createParty, updateParty } from '@/modules/parties/service';
import { useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { INDIAN_STATES } from '@/utils/constants';
import { paiseToRupeeInput, parseRupeesToPaise } from '@/utils/format';
import type { Party } from '@/db/schema';

type PartyType = 'customer' | 'supplier';

// Shared by the "new" and "edit" routes. When `party` is supplied it edits in
// place; otherwise it creates. Navigates back on success.
export default function PartyForm({ party }: { party?: Party }) {
  const router = useRouter();
  const editing = !!party;

  const [name, setName] = useState(party?.name ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [gstin, setGstin] = useState(party?.gstin ?? '');
  const [address, setAddress] = useState(party?.address ?? '');
  const [city, setCity] = useState(party?.city ?? '');
  const [state, setState] = useState(party?.state ?? '');
  const [type, setType] = useState<PartyType>(party?.type ?? 'customer');
  const [opening, setOpening] = useState(party ? paiseToRupeeInput(party.openingBalance) : '');
  const [voiceAlias, setVoiceAlias] = useState(party?.voiceAlias ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter the party name.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: trimmedName,
        phone: phone.trim() || null,
        gstin: gstin.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        type,
        openingBalance: parseRupeesToPaise(opening),
        voiceAlias: voiceAlias.trim() || null,
      };
      if (editing) {
        await updateParty(party.id, data);
      } else {
        await createParty(data);
      }
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  // Voice: "பெயர் ராஜேஷ்", "போன் 98765 43210", "ஊர் மதுரை", "சேமி".
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
      case 'phone':
        setPhone(intent.value);
        return true;
      case 'city':
        setCity(intent.value);
        return true;
      case 'amount':
        setOpening(intent.value);
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
        <View style={styles.typeRow}>
          {(['customer', 'supplier'] as const).map((t) => {
            const active = type === t;
            return (
              <Pressable
                key={t}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeText, active && styles.typeTextActive]}>
                  {t === 'customer' ? 'Customer' : 'Supplier'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextField label="Name" value={name} onChangeText={setName} placeholder="Party name" required />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="Mobile number"
          keyboardType="phone-pad"
        />
        <TextField
          label="GSTIN"
          value={gstin}
          onChangeText={setGstin}
          placeholder="15-digit GST number"
          autoCapitalize="characters"
        />
        <TextField
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Billing address"
          multiline
        />
        <View style={styles.row}>
          <View style={styles.col}>
            <TextField label="City" value={city} onChangeText={setCity} placeholder="City" />
          </View>
          <View style={styles.col}>
            <SelectField
              label="State"
              value={state}
              onSelect={setState}
              options={INDIAN_STATES}
              placeholder="Select state"
            />
          </View>
        </View>
        <TextField
          label="Opening balance (₹)"
          value={opening}
          onChangeText={setOpening}
          placeholder="0"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          Positive = they owe you at the start. Enter a negative amount if you owe them.
        </Text>

        <TextField
          label="Voice name (தமிழ்)"
          value={voiceAlias}
          onChangeText={setVoiceAlias}
          placeholder="e.g. ராஜேஷ் அண்ணா, rajesh stores"
        />
        <Text style={styles.hint}>
          What you say for this party when using voice commands. Comma separated for several.
        </Text>

        <Button
          label={editing ? 'Save changes' : 'Add party'}
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
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  typeChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  typeText: { fontWeight: '600', color: '#666' },
  typeTextActive: { color: '#fff' },
  hint: { fontSize: 12, color: '#888', marginTop: -6 },
  save: { marginTop: 8 },
});
