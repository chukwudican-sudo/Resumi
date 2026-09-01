/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /**
       * The design's palette, named by role rather than by hue so a later
       * change of colour does not leave every component referring to "green".
       *
       * Warm off-white ground, near-black ink, one accent that only ever marks
       * the single action on a screen. Deliberately NOT the old dark theme:
       * these are the values from the design canvases.
       */
      colors: {
        ink: {
          DEFAULT: '#1A1815',   // headings, primary text
          prose: '#57544E',     // body copy
          muted: '#8A8680',     // secondary labels
          faint: '#A8A39B',     // metadata, placeholders
          ghost: '#C0BAB1',     // disabled
        },
        ground: {
          DEFAULT: '#FBFAF8',   // page
          panel: '#F7F5F1',     // sidebars, insets
          band: '#F5F3EF',      // full-width bands
          surface: '#FFFFFF',   // cards
          dark: '#171A18',      // inverted sections
        },
        rule: {
          DEFAULT: '#E9E5DE',   // card borders
          soft: '#F4F1EB',      // row dividers
          field: '#E0DCD4',     // inputs, buttons
        },
        accent: {
          DEFAULT: '#2F5D50',
          hover: '#23463C',
          tint: '#F4F7F5',      // selected surfaces
          wash: '#EDF2EF',      // chips, pills
          line: '#DCE5E0',
        },
        flag: {
          DEFAULT: '#8A6414',   // "needs attention", never red — nothing here is an error
          ink: '#6B4E10',
          bg: '#FDF9F0',
          line: '#EADFC4',
          wash: '#FAF2E4',
        },
      },
      fontFamily: {
        // Set by next/font in app/layout.tsx.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
