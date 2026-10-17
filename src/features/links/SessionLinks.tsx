/**
 * A session's links as the people going see them (Organizar v2, phones 3–4).
 *
 * Each link is a card that names its domain in full and says it opens
 * outside Movo. Tapping it does not leave yet: «Vas a salir de Movo» shows
 * the domain large and the whole address, so a link that is not what it
 * claims to be can be caught before the tap that matters. A domain the
 * person already trusts on this device skips that step.
 *
 * «Reportar este enlace» hands the link to the session's report form with
 * the reason already chosen; it goes to the same queue as any report.
 */

import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import type { ActivityLink } from '../../lib/links';
import { loadTrustedDomains, trustDomain } from '../../lib/trustedLinks';
import { hitSlopFor, size } from '../../theme';
import { detailStyles as s } from '../detail/styles';

interface Props {
  links: ActivityLink[];
  onReport: (link: ActivityLink) => void;
}

function titleFor(index: number): string {
  return index === 0 ? 'Ver la ruta' : 'Otro enlace';
}

export function SessionLinks({ links, onReport }: Props) {
  const [leaving, setLeaving] = useState<ActivityLink | null>(null);
  const [remember, setRemember] = useState(false);
  const [trusted, setTrusted] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void loadTrustedDomains().then((set) => {
      if (!cancelled) setTrusted(set);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (links.length === 0) return null;

  const open = (link: ActivityLink) => {
    void Linking.openURL(link.url);
  };

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Enlaces</Text>
      {links.map((link, index) => (
        <View key={link.position} style={s.linkBlock}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${titleFor(index)}: ${link.domain}. Se abre fuera de Movo.`}
            onPress={() => {
              if (trusted.has(link.domain)) open(link);
              else {
                setRemember(false);
                setLeaving(link);
              }
            }}
            style={s.linkCard}
          >
            <Text style={s.linkTitle}>{titleFor(index)}</Text>
            <Text style={s.linkDomain}>{link.domain} · se abre fuera de Movo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reportar el enlace a ${link.domain}`}
            hitSlop={hitSlopFor(size.controlSm)}
            onPress={() => {
              onReport(link);
            }}
            style={s.report}
          >
            <Text style={s.reportText}>Reportar este enlace</Text>
          </Pressable>
        </View>
      ))}

      {leaving && (
        <View accessibilityViewIsModal style={[s.sheet, s.leaveSheet]}>
          <Text accessibilityRole="header" style={s.sheetTitle}>
            Vas a salir de Movo
          </Text>
          <View style={s.leaveTarget}>
            <Text style={s.leaveDomain}>{leaving.domain}</Text>
            <Text selectable style={s.leaveUrl}>
              {leaving.url}
            </Text>
          </View>
          <Text style={s.sheetBody}>
            Revisa que sea la app o la página que esperabas. Lo que pase ahí ya no depende de Movo.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            aria-checked={remember}
            accessibilityLabel={`No volver a preguntar para ${leaving.domain}`}
            onPress={() => {
              setRemember(!remember);
            }}
            style={s.checkRow}
          >
            <View style={[s.checkBox, remember && s.checkBoxOn]}>
              {remember && <Text style={s.checkMark}>✓</Text>}
            </View>
            <Text style={s.sheetBody}>No volver a preguntar para {leaving.domain}</Text>
          </Pressable>
          <View style={s.sheetActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={() => {
                setLeaving(null);
              }}
              style={s.cancel}
            >
              <Text style={s.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Abrir ${leaving.domain}`}
              onPress={() => {
                const link = leaving;
                setLeaving(null);
                if (remember) void trustDomain(link.domain).then(setTrusted);
                open(link);
              }}
              style={s.leaveOpen}
            >
              <Text style={s.leaveOpenText}>Abrir</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
