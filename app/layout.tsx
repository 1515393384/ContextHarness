import type {Metadata} from 'next';
import {Plus_Jakarta_Sans, JetBrains_Mono} from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'ContextHarness — Fixed-Budget 3K–8K Coding Workbench',
  description:
    'Fixed-budget (3K–8K) context-driven coding harness with 4-slot prompt compiler, read-only contract locks, and DDI circuit breaker.',
  openGraph: {
    title: 'ContextHarness — Fixed-Budget 3K–8K Coding Workbench',
    description:
      'Fixed-budget (3K–8K) context-driven coding harness with 4-slot prompt compiler, read-only contract locks, and DDI circuit breaker.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ContextHarness — Fixed-Budget 3K–8K Coding Workbench',
    description:
      'Fixed-budget (3K–8K) context-driven coding harness with 4-slot prompt compiler, read-only contract locks, and DDI circuit breaker.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
