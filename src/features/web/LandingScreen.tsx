/**
 * movo.app: the page that explains Movo (Landing v3, 4 November).
 *
 * Public and indexable, readable without an account. It lives at /inicio for
 * now: the web root is still Descubrir, and whether the root becomes this page
 * is a decision for Kris and Ale, not a side effect of a PR.
 *
 * Built from the board with two changes, both because the app is not in a
 * store yet: the store buttons become «Abrir Movo» and «Crear cuenta», and
 * the board's phone screenshots become plain cards. The copy is in
 * src/content/landing.es.ts, which says what was left out and why.
 *
 * The heat behind the hero is an illustration, as the board asks until
 * launch: blurred colour with no numbers and no real zones.
 */

import { Link, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { CLOSING, FAMILIES, HERO, ORGANIZE, SAFETY, STEPS } from '../../content/landing.es';
import { color } from '../../theme';
import { FAMILY_COLOR, FAMILY_NAME } from '../../theme/sport';
import { Icon } from '../nav/Icon';
import { landingStyles as s } from './landingStyles';

const WIDE = 900;

/** Blurred warm blobs: the heat map's colours with nothing behind them. */
function Glow({ seed }: { seed: 'hero' | 'closing' }) {
  const blobs =
    seed === 'hero'
      ? [
          { cx: '78%', cy: '30%', r: '32%', c: '#FF7A4D', o: 0.55 },
          { cx: '62%', cy: '62%', r: '26%', c: '#E94E3D', o: 0.4 },
          { cx: '90%', cy: '70%', r: '22%', c: '#FFC56B', o: 0.45 },
        ]
      : [
          { cx: '20%', cy: '50%', r: '30%', c: '#FF7A4D', o: 0.35 },
          { cx: '80%', cy: '40%', r: '28%', c: '#FFC56B', o: 0.3 },
        ];
  return (
    <View aria-hidden pointerEvents="none" style={s.glow}>
      <Svg height="100%" width="100%">
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient cx="50%" cy="50%" id={`g${seed}${String(i)}`} key={i} r="50%">
              <Stop offset="0" stopColor={b.c} stopOpacity={b.o} />
              <Stop offset="1" stopColor={b.c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => (
          <Circle cx={b.cx} cy={b.cy} fill={`url(#g${seed}${String(i)})`} key={i} r={b.r} />
        ))}
      </Svg>
    </View>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <View style={s.check}>
      <Icon color={color.semantic.success} name="check" size={14} />
      <Text style={s.checkText}>{text}</Text>
    </View>
  );
}

export function LandingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const scroll = useRef<ScrollView>(null);
  const anchors = useRef<Record<string, number>>({});

  const jump = (key: string) => {
    scroll.current?.scrollTo({ y: anchors.current[key] ?? 0, animated: true });
  };
  const mark = (key: string) => ({
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      anchors.current[key] = e.nativeEvent.layout.y;
    },
  });

  const ctas = (
    <View style={s.ctaRow}>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/');
        }}
        style={s.primary}
      >
        <Text style={s.primaryText}>Abrir Movo</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/sign-up');
        }}
        style={s.secondary}
      >
        <Text style={s.secondaryText}>Crear cuenta</Text>
      </Pressable>
    </View>
  );

  const cellStyle = (columns: 2 | 3) => [s.cell, wide && (columns === 2 ? s.cell2 : s.cell3)];

  return (
    <ScrollView ref={scroll} style={s.screen}>
      <View style={s.page}>
        <View style={s.hero}>
          <Glow seed="hero" />
          <View style={s.wrap}>
            <View role="navigation" style={s.nav}>
              <Text style={s.logo}>movo</Text>
              {wide && (
                <View style={s.navLinks}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => {
                      jump('how');
                    }}
                  >
                    <Text style={s.navLink}>Cómo funciona</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => {
                      jump('safety');
                    }}
                  >
                    <Text style={s.navLink}>Seguridad</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => {
                      jump('organize');
                    }}
                  >
                    <Text style={s.navLink}>Para organizar</Text>
                  </Pressable>
                </View>
              )}
              <View style={s.navSpacer} />
              <Link href="/sign-in" style={s.navEnter}>
                Entrar
              </Link>
            </View>

            <View style={s.heroBody}>
              <Text style={s.eyebrow}>{HERO.eyebrow}</Text>
              <Text accessibilityRole="header" style={[s.heroTitle, wide && s.heroTitleWide]}>
                {HERO.title} <Text style={s.sun}>{HERO.highlight}</Text>
              </Text>
              <Text style={s.lead}>{HERO.body}</Text>
              {ctas}
              <View style={s.checks}>
                {HERO.checks.map((c) => (
                  <CheckLine key={c} text={c} />
                ))}
              </View>
            </View>
          </View>
        </View>

        <View {...mark('how')} style={[s.wrap, s.section]}>
          <Text style={s.eyebrow}>CÓMO FUNCIONA</Text>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            Del mapa a la cancha, en tres pasos
          </Text>
          <View style={s.grid}>
            {STEPS.map((step, i) => (
              <View key={step.title} style={[...cellStyle(3), s.card]}>
                <View style={s.cardHead}>
                  <View style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Icon color={color.text.secondary} name={step.icon} size={18} />
                </View>
                <Text style={s.cardTitle}>{step.title}</Text>
                <Text style={s.cardBody}>{step.body}</Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={s.sectionTitle}>
            Hoy hay sesiones de
          </Text>
          <View style={s.grid}>
            {FAMILIES.map((f) => (
              <View key={f.family} style={[...cellStyle(3), s.card]}>
                <View style={s.cardHead}>
                  <View
                    aria-hidden
                    style={[s.familyDot, { backgroundColor: FAMILY_COLOR[f.family] }]}
                  />
                  <Text style={s.cardTitle}>{FAMILY_NAME[f.family]}</Text>
                </View>
                <Text style={s.cardBody}>{f.body}</Text>
                <View style={s.sportRow}>
                  {f.sports.map((sport) => (
                    <Text key={sport} style={s.sport}>
                      {sport}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View {...mark('safety')} style={s.band}>
          <View style={[s.wrap, s.section]}>
            <Text style={s.eyebrow}>{SAFETY.eyebrow}</Text>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              {SAFETY.title}
            </Text>
            <Text style={s.sectionLead}>{SAFETY.body}</Text>
            <View style={s.grid}>
              {SAFETY.items.map((item) => (
                <View key={item.title} style={[...cellStyle(2), s.card, s.cardOnBand]}>
                  <View style={s.cardHead}>
                    <View style={s.iconCircle}>
                      <Icon color={color.accent.cool} name={item.icon} size={18} />
                    </View>
                    <Text style={s.cardTitle}>{item.title}</Text>
                  </View>
                  <Text style={s.cardBody}>{item.body}</Text>
                </View>
              ))}
            </View>
            <Link href="/normas" style={s.textLink}>
              Lee las normas de la comunidad ›
            </Link>
          </View>
        </View>

        <View {...mark('organize')} style={[s.wrap, s.section]}>
          <Text style={s.eyebrow}>{ORGANIZE.eyebrow}</Text>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            {ORGANIZE.title}
          </Text>
          <View style={s.checkList}>
            {ORGANIZE.checks.map((c) => (
              <CheckLine key={c} text={c} />
            ))}
          </View>
          <View style={s.ctaRow}>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.push('/crear');
              }}
              style={s.primary}
            >
              <Text style={s.primaryText}>Organizar una sesión</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.closing}>
          <Glow seed="closing" />
          <Text accessibilityRole="header" style={s.closingTitle}>
            {CLOSING.title}
            {'\n'}
            <Text style={s.sun}>{CLOSING.highlight}</Text>
          </Text>
          {ctas}
        </View>

        <View style={[s.wrap, s.footer]}>
          <Text style={s.logo}>movo</Text>
          <View role="navigation" style={s.footerLinks}>
            <Link href="/normas" style={s.footerLink}>
              Normas de la comunidad
            </Link>
            <Link href="/ayuda" style={s.footerLink}>
              Ayuda
            </Link>
          </View>
          <Text style={s.footerNote}>Hecho en Costa Rica · © 2026 Movo</Text>
        </View>
      </View>
    </ScrollView>
  );
}
