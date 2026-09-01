import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import RecoveryBanner from './components/RecoveryBanner';

/**
 * The two faces the design uses. Loaded through next/font so they are
 * self-hosted and carry no render-blocking request to Google.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Resumi',
  description: 'A resume that changes for every job you apply to.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${sans.variable} ${serif.variable}`}>
        <body>
          <RecoveryBanner />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
