import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
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
  //
  // Guarded, because this is the root layout: an unhandled throw here fails
  // every page at once and takes app/error.tsx down with it, since that renders
  // inside this. When the connection pool was exhausted the whole site went
  // dark rather than showing anyone an error. The pages below already cope with
  // a missing user row, so a failure here should cost the sync, not the site.
  try {
    await syncCurrentUser();
  } catch (error) {
    // Next signals "this route is dynamic" by throwing, so that one has to keep
    // travelling or a page that reads headers gets rendered statically and
    // serves one person's data to the next.
    if ((error as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') throw error;
    console.error('[Resumi] Could not sync the signed-in user; rendering anyway.', error);
  }

  return (
    <ClerkProvider>
      <html lang="en" className={`${sans.variable} ${serif.variable}`}>
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
