'use client';

import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { ReactNode } from 'react';

export function PayPalProvider({ children }: { children: ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';

  if (!clientId) {
    console.warn('PayPal Client ID not found. Payment features will be disabled.');
    return <>{children}</>;
  }

  return (
    <PayPalScriptProvider 
      options={{ 
        clientId,
        currency: 'USD',
        intent: 'capture'
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}
