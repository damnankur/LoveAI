import type { Metadata } from 'next';
import { Caveat, Fraunces, Lora } from 'next/font/google';
import ThemeInit from '@/lib/theme-init';
import RevealObserver from '@/components/RevealObserver';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-hand',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
});

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
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.setAttribute('data-reveal-ready','')",
          }}
        />
      </head>
      <body className={`${fraunces.variable} ${caveat.variable} ${lora.variable}`}>
        <ThemeInit />
        <RevealObserver />
        {children}
      </body>
    </html>
  );
}
