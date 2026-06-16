'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LicenserClient } from '../client.js';
import type { LicenserClientOptions } from '../types.js';

interface LicenseContextValue {
  client: LicenserClient;
  productSlug?: string;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export interface LicenseProviderProps extends LicenserClientOptions {
  children: ReactNode;
}

/**
 * Wrap your app once at the root. Subsequent `useLicense({ key })` calls
 * inherit the endpoint + productSlug instead of repeating them.
 */
export function LicenseProvider({ children, ...opts }: LicenseProviderProps) {
  // Memo on every field that affects the client identity so we don't churn on re-renders.
  const value = useMemo<LicenseContextValue>(
    () => ({ client: new LicenserClient(opts), productSlug: opts.productSlug }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.endpoint, opts.productSlug, opts.timeoutMs]
  );
  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

/** Internal accessor — useLicense calls this when no client is passed inline. */
export function useLicenseContext(): LicenseContextValue | null {
  return useContext(LicenseContext);
}
