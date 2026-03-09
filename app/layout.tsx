import type { Metadata } from 'next';
import './globals.css';
import { PayPalProvider } from '@/components/PayPalProvider';
import { ClientLayout } from '@/components/ClientLayout';

export const metadata: Metadata = {
  title: 'הפסיכולוגית - Social Dynamics Analyzer',
  description: 'AI-powered WhatsApp chat analysis for understanding social dynamics',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 min-h-screen">
        <ClientLayout>
          <PayPalProvider>
            {children}
          </PayPalProvider>
        </ClientLayout>
      </body>
    </html>
  );
}
