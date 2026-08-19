// The "which account did this money move through" field, shared by the payment
// and expense forms.
//
// It renders NOTHING until the shop has set up an account. A shop that keeps one
// cash box and never opens this part of the app is never asked the question —
// and once accounts exist, one is chosen for them, so the field is a correction
// rather than a decision.

import { useEffect, useRef, useState } from 'react';
import PickerField, { type PickerOption } from '@/components/PickerField';
import { defaultAccount } from '@/modules/bankAccounts/ledger';
import { listBankAccounts } from '@/modules/bankAccounts/service';
import { formatMoney } from '@/utils/format';
import type { BankAccount } from '@/db/schema';

export default function AccountPicker({
  value,
  onChange,
  label = 'Account',
}: {
  value: number | null;
  onChange: (id: number) => void;
  label?: string;
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  // The picked value at mount: an edit form arrives with one already set, and
  // that must not be overwritten by the default.
  const initial = useRef(value);

  useEffect(() => {
    let active = true;
    listBankAccounts().then((rows) => {
      if (!active) return;
      setAccounts(rows);
      if (initial.current == null) {
        const pick = defaultAccount(rows);
        if (pick) onChange(pick.id);
      }
    });
    return () => {
      active = false;
    };
    // Runs once: the account list does not change while a form is open.
  }, []);

  if (accounts.length === 0) return null;

  const options: PickerOption[] = accounts.map((a) => ({
    id: a.id,
    label: a.name,
    sublabel: `${a.type === 'cash' ? 'Cash' : 'Bank'} · opened at ${formatMoney(a.openingBalance)}`,
  }));

  return (
    <PickerField
      label={label}
      value={value}
      onSelect={onChange}
      options={options}
      placeholder="Select account"
    />
  );
}
