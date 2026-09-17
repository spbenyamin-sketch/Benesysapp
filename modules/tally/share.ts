// Handing the file over.
//
// The same fork every export in this app makes (modules/reports/excel.ts, the
// GSTR-1 file in app/report/gst.tsx): a browser downloads, a phone writes the
// file to its cache and opens the share sheet — which is how it reaches the
// accountant, usually over WhatsApp.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { downloadFile, isWeb } from '@/utils/webFile';
import { buildTallyXml, tallyFilename } from './build';
import type { TallyOptions, TallyPayload } from './types';

const MIME = 'application/xml';

/** Returns where it went: a file uri on the phone, the filename in a browser. */
export async function shareTallyXml(
  payload: TallyPayload,
  options: TallyOptions = {},
): Promise<string> {
  const xml = buildTallyXml(payload, options);
  const filename = tallyFilename(payload);

  if (isWeb) {
    downloadFile(filename, xml, MIME);
    return filename;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(xml);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: MIME,
      dialogTitle: filename,
      UTI: 'public.xml',
    });
  }
  return file.uri;
}
