/**
 * Normas de la comunidad — public, and readable without an account.
 *
 * `docs/security.md` says the rules have to exist publicly before the first
 * session is cancelled for breaking them. Public means somebody deciding
 * whether to sign up can read them first, so this screen does not ask for a
 * session, and the suspension screen lets a suspended person through to it.
 *
 * Step 31 of the 2 November walkthrough: a headline, the intro, the safety
 * box, then «En esta página» — one row per section with how many rules it
 * holds. A section opens as `?seccion=<id>`, so the back button closes it.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { color } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../nav/Icon';
import {
  consequenceItems,
  RULE_SECTIONS,
  RULES_HEADLINE,
  RULES_INTRO,
  RULES_SAFETY,
  RULES_VERSION,
  type RuleSection,
} from './rules';
import { rulesStyles as s } from './styles';

/** «22 de septiembre de 2026». A calendar date, so read and formatted in UTC. */
function versionLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

const ICONS: Record<string, IconName> = {
  todos: 'people',
  organizar: 'clipboard',
  equipo: 'shield',
};

function sections(): RuleSection[] {
  return [
    ...RULE_SECTIONS,
    { id: 'equipo', title: 'Qué hace el equipo de Movo', items: consequenceItems() },
  ];
}

function Rule({ rule, detail }: { rule: string; detail: string }) {
  return (
    <View accessible style={s.item}>
      <Text style={s.rule}>{rule}</Text>
      <Text style={s.detail}>{detail}</Text>
    </View>
  );
}

export function RulesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  const all = sections();
  const open = all.find((section) => section.id === seccion) ?? null;

  // The safety box leads with its first sentence in bold, as on the board.
  const cut = RULES_SAFETY.indexOf('. ') + 1;
  const safetyLead = RULES_SAFETY.slice(0, cut);
  const safetyRest = RULES_SAFETY.slice(cut);

  const back = () => {
    if (router.canGoBack()) router.back();
    else if (open) router.replace('/normas');
    else router.replace(session ? '/' : '/sign-up');
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Volver a las normas' : 'Volver'}
          onPress={back}
          style={s.topBack}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <View style={s.topText}>
          <Text style={s.topTitle}>Normas de la comunidad</Text>
          <Text style={s.topSub}>Se leen sin cuenta</Text>
        </View>
      </View>

      {open ? (
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            {open.title}
          </Text>
          {open.items.map((item) => (
            <Rule detail={item.detail} key={item.rule} rule={item.rule} />
          ))}
        </View>
      ) : (
        <>
          <View style={s.header}>
            <Text style={s.version}>Del {versionLabel(RULES_VERSION)}</Text>
            <Text accessibilityRole="header" style={s.title}>
              {RULES_HEADLINE}
            </Text>
            <Text style={s.intro}>{RULES_INTRO}</Text>
          </View>

          {/* First, not last: somebody who opens this in trouble should not
              have to read the rules to find out what to do. */}
          <View style={s.safety}>
            <Text style={s.safetyText}>
              <Text style={s.safetyLead}>{safetyLead}</Text>
              {safetyRest}
            </Text>
          </View>

          <View style={s.index}>
            <Text style={s.overline}>EN ESTA PÁGINA</Text>
            {all.map((section) => (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${section.title}, ${section.items.length} normas`}
                key={section.id}
                onPress={() => {
                  router.push({ pathname: '/normas', params: { seccion: section.id } });
                }}
                style={s.indexRow}
              >
                <Icon color={color.accent.cool} name={ICONS[section.id] ?? 'book'} size={18} />
                <Text style={s.indexTitle}>{section.title}</Text>
                <Text style={s.indexCount}>{section.items.length}</Text>
                <Icon color={color.text.tertiary} name="chevronRight" size={16} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
