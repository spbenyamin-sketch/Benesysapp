import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import PartyForm from '@/modules/parties/PartyForm';
import { getParty } from '@/modules/parties/service';
import type { Party } from '@/db/schema';

export default function EditPartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);
  const [party, setParty] = useState<Party | null | undefined>(undefined);

  useEffect(() => {
    getParty(partyId).then((p) => setParty(p ?? null));
  }, [partyId]);

  if (party === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (party === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Party not found.</Text>
      </View>
    );
  }
  return <PartyForm party={party} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
