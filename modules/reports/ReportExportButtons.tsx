// Excel and PDF side by side, the same two buttons on every report screen. Both
// export the one ReportBook the screen hands in, so the PDF and the workbook
// always carry the same figures. The Excel half keeps its voice intent
// ("எக்செல்" / "export excel") through ExcelExportButton.

import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Button from '@/components/Button';
import ExcelExportButton from '@/components/ExcelExportButton';
import { shareBookExcel, type ReportBook } from '@/modules/reports/excel';
import { shareBookPdf } from '@/modules/reports/pdf';
import { t } from '@/i18n';

export default function ReportExportButtons({ book }: { book: () => Promise<ReportBook> }) {
  const [busy, setBusy] = useState(false);

  const pdf = () => {
    if (busy) return;
    setBusy(true);
    book()
      .then(shareBookPdf)
      .catch((e: unknown) => Alert.alert(t('PDF failed'), (e as Error)?.message ?? String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <ExcelExportButton label="⬇  Excel" onExport={() => book().then(shareBookExcel)} />
      </View>
      <View style={styles.cell}>
        <Button label="⬇  PDF" tone="ghost" onPress={pdf} loading={busy} style={styles.btn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
  btn: { marginTop: 4 },
});
