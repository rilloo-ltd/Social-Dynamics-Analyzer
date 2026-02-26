import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ניתוח דינמיקה חברתית בוואטסאפ',
  description: 'ניתוח מתקדם של שיחות וואטסאפ באמצעות בינה מלאכותית',
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
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
