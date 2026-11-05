import { StatusPage } from '../features/web/StatusPage';

/** Páginas web v1 · 4–5: any address nothing answers. noindex like every other path not listed. */
export default function NotFound() {
  return <StatusPage kind="not_found" />;
}
