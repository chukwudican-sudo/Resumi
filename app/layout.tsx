import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import RecoveryBanner from './components/RecoveryBanner';
import { syncCurrentUser } from './server/auth';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Makes sure a signed-in person exists in the database before any page tries
  // to write something owned by them. Costs one primary-key lookup on a normal
  // request; only a brand-new account pays for anything more. See syncCurrentUser.
  await syncCurrentUser();

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
