'use client';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CustomerForm } from '../../../../../../components/finance/CustomerForm';
import { ErrorNote, useRemote } from '../../../../../../components/finance/masterBits';
import { FinancePage } from '../../../../../../components/finance/ui';
import { financeApi } from '../../../../../../lib/financeApi';

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const { data, loading, error, reload } = useRemote(() => financeApi.customers.get(id), [id]);
  const customer = data?.data;

  return (
    <FinancePage title={customer ? `Edit ${customer.display_name}` : 'Edit Customer'} maxWidth={960}>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !customer && <div style={{ color: 'var(--mute)', fontSize: 14 }}>Loading…</div>}
      {customer && (
        <CustomerForm key={customer.id} mode="edit" initial={customer} onSaved={(c) => {
          toast.success('Customer updated');
          router.push(`/dashboard/finance/customers/${c.id}`);
        }} />
      )}
    </FinancePage>
  );
}
