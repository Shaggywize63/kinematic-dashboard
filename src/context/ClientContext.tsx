'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isUUID } from '@/lib/utils';
import { getActingAs } from '@/lib/api';

interface ClientContextType {
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
  /** True when a super-admin is "acting as" a specific client: the global client
   *  picker is pinned to that client and cannot be changed (incl. to "All
   *  clients"), so every page scopes to the client being viewed. */
  locked: boolean;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [locked, setLocked] = useState<boolean>(false);

  useEffect(() => {
    // When "acting as a client" (super-admin Login-as / client view), pin the
    // picker to that client so every page scopes to it and can't sit on "All
    // clients" (which would request the cross-tenant global view). Acting-as is
    // set and the app reloads on enter/exit, so reading it once on mount is
    // enough. We deliberately do NOT persist the pinned id to localStorage, so
    // the user's own picker preference is restored when they exit client view.
    const acting = getActingAs();
    if (acting?.client_id && isUUID(acting.client_id)) {
      setSelectedClientId(acting.client_id);
      setLocked(true);
      return;
    }
    setLocked(false);
    const saved = localStorage.getItem('kinematic_selected_client');
    if (saved && isUUID(saved)) {
      setSelectedClientId(saved);
    } else if (saved && saved !== '') {
      // Clear invalid IDs (like 'cl1' or 'all')
      localStorage.removeItem('kinematic_selected_client');
    }
  }, []);

  const handleSetSelectedClientId = (id: string) => {
    // While acting as a client the picker is locked — ignore manual changes.
    if (locked) return;
    setSelectedClientId(id);
    if (id) {
      localStorage.setItem('kinematic_selected_client', id);
    } else {
      localStorage.removeItem('kinematic_selected_client');
    }
  };

  return (
    <ClientContext.Provider value={{ selectedClientId, setSelectedClientId: handleSetSelectedClientId, locked }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
}
