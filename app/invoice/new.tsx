import { Stack, useLocalSearchParams } from 'expo-router';
import InvoiceForm from '@/modules/invoices/InvoiceForm';
import type { InvoiceType } from '@/utils/invoiceNumber';

const TITLES: Record<InvoiceType, string> = {
  sale: 'New Sale',
  purchase: 'New Purchase',
  quotation: 'New Quotation',
  challan: 'New Challan',
  saleReturn: 'Sale Return',
};

const VALID: InvoiceType[] = ['sale', 'purchase', 'quotation', 'challan', 'saleReturn'];

export default function NewInvoiceScreen() {
  // `partyId` is optional — it arrives when the bill was started from a party's
  // ledger (by tap or by voice), so the customer is already filled in. `from` is
  // the invoice being returned, and fills the whole form in.
  const { type, partyId, from } = useLocalSearchParams<{
    type?: string;
    partyId?: string;
    from?: string;
  }>();
  const t = (VALID.includes(type as InvoiceType) ? type : 'sale') as InvoiceType;
  const initialPartyId = Number(partyId) || undefined;
  const sourceInvoiceId = Number(from) || undefined;
  return (
    <>
      <Stack.Screen options={{ title: TITLES[t] }} />
      <InvoiceForm type={t} initialPartyId={initialPartyId} sourceInvoiceId={sourceInvoiceId} />
    </>
  );
}
