// "Export to Excel" for the report screens. Also registers the `exportExcel`
// voice intent ("எக்செல்" / "export excel"), so the same action works by voice
// on whichever report is open.

import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import Button from '@/components/Button';
import { useVoiceCommands } from '@/modules/voice/VoiceProvider';

export default function ExcelExportButton({
  onExport,
  label = '⬇  Export to Excel',
}: {
  /** Builds + shares the workbook; resolves with the written file uri. */
  onExport: () => Promise<string>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const run = () => {
    if (busy) return;
    setBusy(true);
    onExport()
      .catch((e: unknown) => Alert.alert('Export failed', (e as Error)?.message ?? String(e)))
      .finally(() => setBusy(false));
  };

  useVoiceCommands((intent) => {
    if (intent.kind !== 'exportExcel') return false;
    run();
    return true;
  });

  return <Button label={label} tone="ghost" onPress={run} loading={busy} style={styles.btn} />;
}

const styles = StyleSheet.create({
  btn: { marginTop: 4 },
});
