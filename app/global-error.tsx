'use client';

import { useEffect } from 'react';

/**
 * The last resort: an error in the root layout itself.
 *
 * This replaces the entire document, so it has to bring its own html and body —
 * the layout that would normally provide them is the thing that failed. It also
 * cannot use the app's fonts or stylesheet for the same reason, hence the
 * inline styles, which are otherwise not how anything here is written.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Resumi] Root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#FBFAF8', color: '#1A1815' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontSize: 30, fontWeight: 400, margin: 0 }}>Resumi could not start.</h1>
            <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#4A463F' }}>
              Nothing you saved has been affected. Reloading usually clears it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 26,
                padding: '12px 20px',
                fontSize: 14,
                borderRadius: 4,
                border: 0,
                background: '#2F5D50',
                color: '#FBFAF8',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            {/*
              A plain anchor, and the only way off this screen.
              
              This replaces the root layout when the root layout itself fails,
              so there is no Link, no router and no nav — it offered a reload
              button and nothing else, which for a fault that survives a reload
              is a room with no door. A full page load is exactly what is wanted
              here anyway.
            */}
            <a
              href="/applications"
              style={{ marginLeft: 18, fontSize: 14, color: '#2F5D50' }}
            >
              Back to your applications
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
