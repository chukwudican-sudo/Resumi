import type { Appearance } from '@clerk/types';

/**
 * Makes Clerk's forms look like the rest of the app.
 *
 * Sign-up is where someone decides whether to hand over their work history, so
 * a form that visibly belongs to a different product is a real cost. These are
 * the design's own values rather than Clerk's defaults — the same warm ground,
 * the same green, the same square-ish corners.
 *
 * Clerk's card chrome is switched off entirely: the surrounding page already
 * provides the heading and the frame, so the widget only needs to supply the
 * fields.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#2F5D50',
    colorText: '#1A1815',
    colorTextSecondary: '#57544E',
    colorBackground: '#FBFAF8',
    colorInputBackground: '#FFFFFF',
    colorInputText: '#1A1815',
    colorDanger: '#8A6414',
    borderRadius: '4px',
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '15px',
  },
  elements: {
    // The page owns the heading and the container.
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-none',
    card: 'bg-transparent shadow-none p-0 gap-5',
    header: 'hidden',
    footer: 'hidden',

    socialButtonsBlockButton:
      'border border-[#DDD8D0] bg-white text-[#1A1815] rounded hover:bg-[#F7F5F1] normal-case',
    socialButtonsBlockButtonText: 'font-normal text-[15px]',

    dividerLine: 'bg-[#E5E1DA]',
    dividerText: 'text-[#A8A39B] text-[12.5px]',

    formFieldLabel: 'text-[#57544E] text-[13.5px] font-normal',
    formFieldInput:
      'border border-[#E0DCD4] bg-white rounded text-[15px] text-[#1A1815] focus:border-[#2F5D50] focus:ring-0',
    formButtonPrimary:
      'bg-[#2F5D50] hover:bg-[#23463C] text-[#FBFAF8] rounded normal-case text-[15px] font-medium shadow-none',

    identityPreviewEditButton: 'text-[#2F5D50]',
    formResendCodeLink: 'text-[#2F5D50]',
    otpCodeFieldInput: 'border border-[#E0DCD4] rounded',
  },
};
