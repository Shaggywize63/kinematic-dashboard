
'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ClientContextType {
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem('kinematic_selected_client');
    if (saved) {
      setSelectedClientId(saved);
    }
  }, []);

  const handleSetSelectedClientId = (id: string) => {
    setSelectedClientId(id);
    if (id) {
      localStorage.setItem('kinematic_selected_client', id);
    } else {
      localStorage.removeItem('kinematic_selected_client');
    }
  };

  return (
    <ClientContext.Provider value={{ selectedClientId, setSelectedClientId: handleSetSelectedClientId }}>
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
