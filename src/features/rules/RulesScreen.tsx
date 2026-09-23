/**
 * Normas de la comunidad — public, and readable without an account.
 *
 * `docs/security.md` says the rules have to exist publicly before the first
 * session is cancelled for breaking them. Public means somebody deciding
 * whether to sign up can read them first, so this screen does not ask for a
 * session, and the suspension screen lets a suspended person through to it.
 */

import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { consequenceItems, RULE_SECTIONS, RULES_INTRO, RULES_SAFETY, RULES_VERSION } from './rules';
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

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href={session ? '/' : '/sign-up'} style={s.back}>
        <Text style={s.backText}>{session ? '← Descubrir' : '← Crear cuenta'}</Text>
      </Link>

      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          Normas de la comunidad
        </Text>
        <Text style={s.version}>Versión del {versionLabel(RULES_VERSION)}</Text>
        <Text style={s.intro}>{RULES_INTRO}</Text>
      </View>

      {/* First, not last: somebody who opens this in trouble should not have
          to read the rules to find out what to do. */}
      <View style={s.safety}>
        <Text style={s.safetyText}>{RULES_SAFETY}</Text>
      </View>

      {RULE_SECTIONS.map((section) => (
        <View key={section.id} style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            {section.title}
          </Text>
          {section.items.map((item) => (
            <Rule detail={item.detail} key={item.rule} rule={item.rule} />
          ))}
        </View>
      ))}

      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>
          Qué hace el equipo de Movo
        </Text>
        {consequenceItems().map((item) => (
          <Rule detail={item.detail} key={item.rule} rule={item.rule} />
        ))}
      </View>
    </ScrollView>
  );
}
