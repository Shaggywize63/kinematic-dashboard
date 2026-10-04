'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CustomerForm } from '../../../../../components/finance/CustomerForm';
import { FinancePage } from '../../../../../components/finance/ui';

export default function NewCustomerPage() {
  const router = useRouter();
  return (
    <FinancePage title="New Customer" maxWidth={960}>
      <CustomerForm mode="create" onSaved={(c) => {
        toast.success(`Customer “${c.display_name}” created`);
        router.push(`/dashboard/finance/customers/${c.id}`);
      }} />
    </FinancePage>
  );
}
