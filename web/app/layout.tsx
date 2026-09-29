import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Playfair_Display, Caveat } from 'next/font/google';
import ThemeInit from '@/lib/theme-init';
import RevealObserver from '@/components/RevealObserver';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-hand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'loveAI — love advice that fits how you love',
  description:
    'loveAI learns how you love — your attachment style and love language — then gives relationship advice in the voice of a confidant who knows you.',
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
      <body className={`${jakarta.variable} ${playfair.variable} ${caveat.variable}`}>
        <ThemeInit />
        <RevealObserver />
        {children}
      </body>
    </html>
  );
}
