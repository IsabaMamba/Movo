/**
 * Document shell for the web build.
 *
 * Expo Router renders every web route inside this. It never runs on native, so
 * anything here is web-only by construction.
 *
 * It exists for one reason: the focus ring. `focusRing` has been defined in
 * `src/theme/a11y.ts` since the tokens landed and was never called from
 * anywhere, which meant a keyboard user could not see where they were on any
 * screen in the app. The web build ships before either app store, so that is
 * not a future problem.
 *
 * Doing it here rather than per-component is deliberate. A ring applied by hand
 * to each Pressable is a ring that is missing from whichever one is written
 * next; `:focus-visible` covers every focusable element, including the ones
 * that do not exist yet. `:focus-visible` rather than `:focus` so a mouse click
 * does not leave a ring behind — that is the behaviour people report as a bug
 * and then "fix" by removing the outline entirely.
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { color, focusRing, locale } from '../theme';

const globalCss = `
  /* React Native Web resets outlines to none on every pressable. Putting it
     back is the whole point of this file, so it is !important on purpose —
     the reset it overrides is itself unconditional. */
  :focus-visible {
    outline: ${focusRing.outlineWidth}px solid ${color.border.focus} !important;
    outline-offset: ${focusRing.outlineOffset}px !important;
  }

  /* The ground colour, so an over-scroll bounce does not show white behind a
     dark app. */
  body {
    background-color: ${color.bg.base};
  }

  /* Respect the OS setting. Movo has no animation that carries meaning, so
     there is nothing lost by honouring it. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` for notched devices. No `maximum-scale`: capping
            zoom is the single most common accessibility defect in mobile web,
            and it is written by hand every time. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={color.bg.base} />

        {/* Installable. On iPhone this is not cosmetic: Safari delivers Web Push
            only to a site added to the home screen (ADR 0007), and it needs the
            manifest and the touch icon to offer that. The icon is provisional
            — see public/icon.svg. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Movo" />
        {/* Plain black, not black-translucent: translucent draws the page under
            the status bar, and no screen pads for the safe area yet. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />

        {/* Disables body scrolling on web so ScrollView components work as they
            do on native. Expo Router ships it; without it nested scroll breaks. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
