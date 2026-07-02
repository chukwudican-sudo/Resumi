import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import RecoveryBanner from './components/RecoveryBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Resumi',
  description: 'AI-powered resume tailoring for Canadian internships and jobs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <RecoveryBanner />
        {children}
      </body>
    </html>
  );
}
