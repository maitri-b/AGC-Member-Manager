'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useEffectiveSession } from '@/hooks/useEffectiveSession';
import type { Session } from 'next-auth';

interface EffectiveSessionContextType {
  data: Session | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  isImpersonating: boolean;
  originalAdmin?: {
    id: string;
    name: string;
  };
}

const EffectiveSessionContext = createContext<EffectiveSessionContextType | undefined>(undefined);

export function EffectiveSessionProvider({ children }: { children: ReactNode }) {
  const { data, status, isImpersonating, originalAdmin } = useEffectiveSession();

  return (
    <EffectiveSessionContext.Provider value={{ data, status, isImpersonating, originalAdmin }}>
      {children}
    </EffectiveSessionContext.Provider>
  );
}

/**
 * Use this hook instead of useSession() in any component that needs to respect impersonation
 */
export function useEffectiveSessionContext() {
  const context = useContext(EffectiveSessionContext);
  if (context === undefined) {
    throw new Error('useEffectiveSessionContext must be used within EffectiveSessionProvider');
  }
  return context;
}
