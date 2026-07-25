import { useLocalSearchParams } from 'expo-router';
import PaymentForm from '@/modules/payments/PaymentForm';

export default function NewPaymentScreen() {
  const { partyId, invoiceId } = useLocalSearchParams<{ partyId?: string; invoiceId?: string }>();
  const pParty = partyId ? Number(partyId) : undefined;
  const pInvoice = invoiceId ? Number(invoiceId) : undefined;
  return (
    <PaymentForm
      presetPartyId={Number.isFinite(pParty) ? pParty : undefined}
      presetInvoiceId={Number.isFinite(pInvoice) ? pInvoice : undefined}
    />
  );
}
