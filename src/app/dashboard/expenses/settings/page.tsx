'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The single-policy settings screen was replaced by the Policies manager.
export default function ExpenseSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/expenses/policies'); }, [router]);
  return null;
}
