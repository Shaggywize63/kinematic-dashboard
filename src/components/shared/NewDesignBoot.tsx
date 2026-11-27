'use client';
import { useEffect } from 'react';
import { getStoredUser } from '../../lib/auth';
import { initDesign } from '../../lib/designStore';
import '../../lib/kicons/install'; // side effect: swaps lucide's drawings for the designed icon family while the new design is on

/**
 * Resolves the new-design switch for the signed-in user after mount (the user and the saved choice live in
 * localStorage, which the server can't see). Mount once, inside the dashboard shell. Renders nothing.
 */
export default function NewDesignBoot() {
  useEffect(() => { initDesign(getStoredUser()?.email ?? null); }, []);
  return null;
}
