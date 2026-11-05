/**
 * Ayuda (Ayuda v1 · 1, 2, 5): search, «si estás en peligro» always on top,
 * the six topics with how many questions each, and «Lo más buscado». A
 * topic opens its questions in place; a question has its own address
 * (/ayuda/[id]) to share. Public and indexable: readable before an account.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  HELP_POPULAR,
  HELP_QUESTIONS,
  HELP_TOPICS,
  type HelpQuestion,
  type HelpTopicId,
} from '../../content/help.es';
import { searchHelp } from '../../lib/help';
import { color, hitSlopFor, size } from '../../theme';
import { Icon } from '../nav/Icon';
import { helpStyles as s } from './styles';

export function HelpScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<HelpTopicId | null>(null);

  const open = (q: HelpQuestion) => {
    router.push({ pathname: '/ayuda/[id]', params: { id: q.id } });
  };

  const row = (q: HelpQuestion, last: boolean) => (
    <Pressable
      accessibilityRole="link"
      key={q.id}
      onPress={() => {
        open(q);
      }}
      style={[s.row, last && s.rowLast]}
    >
      <Text style={s.rowText}>{q.question}</Text>
      <Icon color={color.text.tertiary} name="chevronRight" size={16} />
    </Pressable>
  );

  const results = searchHelp(HELP_QUESTIONS, query);
  const searching = query.trim().length >= 2;
  const current = HELP_TOPICS.find((t) => t.id === topic) ?? null;

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel={current ? 'Volver a Ayuda' : 'Volver'}
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            if (current) setTopic(null);
            else if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          {current ? current.title : 'Ayuda'}
        </Text>
      </View>

      {!current && (
        <View style={s.search}>
          <Icon color={color.text.tertiary} name="search" size={16} />
          <TextInput
            accessibilityLabel="Busca tu pregunta"
            onChangeText={setQuery}
            placeholder="Busca tu pregunta"
            placeholderTextColor={color.text.tertiary}
            style={s.searchInput}
            value={query}
          />
        </View>
      )}

      {/* Always first: somebody in trouble should not have to search. */}
      <View accessibilityRole="alert" style={s.danger}>
        <Icon color={color.semantic.dangerOnRaised} name="alert" size={16} />
        <Text style={s.dangerText}>
          <Text style={s.dangerStrong}>Si estás en peligro, llama al 9-1-1.</Text> Movo no es un
          servicio de emergencias.
        </Text>
      </View>

      {searching ? (
        <View style={s.section}>
          <Text style={s.overline}>
            {results.length === 1 ? '1 respuesta' : `${results.length} respuestas`}
          </Text>
          {results.length > 0 && (
            <View style={s.list}>{results.map((q, i) => row(q, i === results.length - 1))}</View>
          )}
          <Text style={s.note}>
            ¿No está tu pregunta? Por ahora no hay un canal para escribirnos; si algo necesita que
            alguien del equipo actúe, usa «Reportar» en la sesión.
          </Text>
        </View>
      ) : current ? (
        <View style={s.list}>
          {HELP_QUESTIONS.filter((q) => q.topic === current.id).map((q, i, all) =>
            row(q, i === all.length - 1),
          )}
        </View>
      ) : (
        <>
          <View style={s.grid}>
            {HELP_TOPICS.map((t) => {
              const count = HELP_QUESTIONS.filter((q) => q.topic === t.id).length;
              return (
                <Pressable
                  accessibilityLabel={`${t.title}, ${count} preguntas`}
                  accessibilityRole="button"
                  key={t.id}
                  onPress={() => {
                    setTopic(t.id);
                  }}
                  style={s.tile}
                >
                  <Icon color={color.accent.cool} name={t.icon} size={20} />
                  <Text style={s.tileTitle}>{t.title}</Text>
                  <Text style={s.tileCount}>{count} preguntas</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={s.section}>
            <Text style={s.overline}>LO MÁS BUSCADO</Text>
            <View style={s.list}>
              {HELP_POPULAR.map((id) => HELP_QUESTIONS.find((q) => q.id === id))
                .filter((q): q is HelpQuestion => q !== undefined)
                .map((q, i, all) => row(q, i === all.length - 1))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
