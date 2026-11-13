// The one HTML builder behind every report PDF: text must be escaped, money
// printed from paise, and the totals row carried through.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

import { buildReportHtml } from '@/utils/reportPdf';
import { sheetToTable } from '@/modules/reports/pdf';

describe('buildReportHtml', () => {
  const html = buildReportHtml({
    business: 'Raj & Co <Chennai>',
    gstin: '33ABCDE1234F1Z5',
    title: 'Sales "Report"',
    subtitle: 'Period: 1 Apr 2026 to 30 Apr 2026',
    tables: [
      {
        name: 'Sales',
        columns: [{ header: 'Party' }, { header: 'Bills' }, { header: 'Total', money: true }],
        rows: [
          ['<script>alert(1)</script>', 2, 123456],
          ['Kumar & Sons', 1, 50],
        ],
        totals: ['TOTAL', 3, 123506],
      },
      { name: 'Returns', columns: [{ header: 'Party' }], rows: [] },
    ],
  });

  it('escapes every piece of text', () => {
    expect(html).toContain('Raj &amp; Co &lt;Chennai&gt;');
    expect(html).toContain('Sales &quot;Report&quot;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Kumar &amp; Sons');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Raj & Co');
  });

  it('prints money from paise and carries the totals row', () => {
    expect(html).toContain('₹1,234.56');
    expect(html).toContain('₹0.50');
    const foot = html.slice(html.indexOf('<tfoot>'), html.indexOf('</tfoot>'));
    expect(foot).toContain('TOTAL');
    expect(foot).toContain('>3<');
    expect(foot).toContain('₹1,235.06');
  });

  it('heads each table when there are several, and says when one is empty', () => {
    expect(html).toContain('<h2>Sales</h2>');
    expect(html).toContain('<h2>Returns</h2>');
    expect(html).toContain('Nothing to show.');
    expect(html).toContain('GSTIN: 33ABCDE1234F1Z5');
  });
});

describe('sheetToTable', () => {
  it('turns rupee money cells back into paise and leaves the rest alone', () => {
    const t = sheetToTable({
      name: 'S',
      columns: [{ header: 'Item' }, { header: 'Share %' }, { header: 'Value', money: true }],
      rows: [['Rice', 33.3, 1234.56], ['Note', 1, 'text']],
      totals: ['TOTAL', 100, 0.1 + 0.2],
    });
    expect(t.rows).toEqual([['Rice', 33.3, 123456], ['Note', 1, 'text']]);
    expect(t.totals).toEqual(['TOTAL', 100, 30]);
  });
});
