import { Redirect } from 'expo-router';

/**
 * Expo Router ships a development page at /_sitemap that lists every route in
 * the app, and the static web build exports it. A list of Movo's staff and
 * account screens is not something to serve to anyone who asks, so this file
 * replaces it. Audit of 7 October, item 3.
 */
export default function Sitemap() {
  return <Redirect href="/" />;
}
