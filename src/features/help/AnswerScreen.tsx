/**
 * One help answer (Ayuda v1 · 3–4), at /ayuda/[id] so it can be shared.
 * Steps when there are steps, the action at the end, then «¿Te sirvió?».
 * A «no» asks which of three things failed and nothing else: it is a way to
 * improve the answers, not to write to the team, and it says so (0047).
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { HELP_QUESTIONS, HELP_TOPICS } from '../../content/help.es';
import { HELP_REASONS, recordHelpFeedback, type HelpReason } from '../../lib/help';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { Icon } from '../nav/Icon';
import { helpStyles as s } from './styles';

export function AnswerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [vote, setVote] = useState<'yes' | 'asking' | 'done' | null>(null);
  const [reason, setReason] = useState<HelpReason>('no_responde');

  const q = HELP_QUESTIONS.find((x) => x.id === id);
  // A question that no longer exists (or a mistyped id) goes back to the index.
  if (!q) return <Redirect href="/ayuda" />;
  const topic = HELP_TOPICS.find((t) => t.id === q.topic);

  const send = (helpful: boolean, why?: HelpReason) => {
    // Fire and forget: a failed vote is not worth an error on top of an answer.
    void recordHelpFeedback(supabase, q.id, helpful, why).catch(() => undefined);
    setVote(helpful ? 'yes' : 'done');
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel="Volver a Ayuda"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/ayuda');
          }}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text style={s.crumb}>Ayuda › {topic?.title}</Text>
      </View>

      <Text accessibilityRole="header" style={s.question}>
        {q.question}
      </Text>

      {q.steps ? (
        <View style={s.steps}>
          {q.answer.map((step, i) => (
            <View key={step} style={s.step}>
              <View aria-hidden style={s.stepNumber}>
                <Text style={s.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={s.answer}>{step}</Text>
            </View>
          ))}
        </View>
      ) : (
        q.answer.map((p) => (
          <Text key={p} style={s.answer}>
            {p}
          </Text>
        ))
      )}

      {q.action && (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (q.action) router.push(q.action.href);
          }}
          style={s.action}
        >
          <Text style={s.actionText}>{q.action.label}</Text>
        </Pressable>
      )}

      <View style={s.feedback}>
        {vote === null ? (
          <View style={s.feedbackRow}>
            <Text style={s.feedbackLabel}>¿Te sirvió?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                send(true);
              }}
              style={s.vote}
            >
              <Text style={s.voteText}>Sí</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setVote('asking');
              }}
              style={s.vote}
            >
              <Text style={s.voteText}>No</Text>
            </Pressable>
          </View>
        ) : vote === 'asking' ? (
          <View style={s.ask}>
            <Text style={s.feedbackLabel}>¿Qué te faltó?</Text>
            <View accessibilityRole="radiogroup">
              {HELP_REASONS.map((r) => {
                const on = reason === r.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    aria-checked={on}
                    key={r.id}
                    onPress={() => {
                      setReason(r.id);
                    }}
                    style={[s.option, on && s.optionOn]}
                  >
                    <View style={[s.radio, on && s.radioOn]} />
                    <Text style={s.optionText}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={s.note}>
              Nos ayuda a mejorar estas respuestas. No es un mensaje al equipo: si necesitas que
              alguien actúe, usa «Reportar».
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                send(false, reason);
              }}
              style={s.action}
            >
              <Text style={s.actionText}>Enviar</Text>
            </Pressable>
          </View>
        ) : (
          <Text accessibilityRole="alert" style={s.thanks}>
            Gracias. {vote === 'yes' ? 'Nos alegra.' : 'Vamos a mejorar esta respuesta.'}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
