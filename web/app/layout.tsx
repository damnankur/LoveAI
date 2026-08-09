import type { Metadata } from 'next';
import ThemeInit from '@/lib/theme-init';
import './globals.css';

export const metadata: Metadata = {
  title: 'loveAI — a companion that knows you',
  description:
    'loveAI — a companion that learns how you think, feel, and communicate, then talks to you like someone who already knows you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#FBF6EE" />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='24' font-size='24'%3E%E2%9D%A4%EF%B8%8F%3C/text%3E%3C/svg%3E"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Caveat:wght@400..700&family=Sora:wght@300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
