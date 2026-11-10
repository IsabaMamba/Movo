/**
 * «¿Sigues en la serie?» (Series v2 · 10; 0057/0059).
 *
 * Shown on the series page to somebody who was on the whole series when the
 * organizer added dates. Two answers of the same weight — neither is the
 * primary colour — because «no» is as good an answer as «sí». No answer means
 * the series ends for them on the old last date.
 */

import { Pressable, Text, View } from 'react-native';

import { questionCopy, type RenewalQuestion } from '../../lib/seriesRenewal';
import { color } from '../../theme';
import { Icon } from '../nav/Icon';
import { seriesStyles as s } from './styles';

interface Props {
  question: RenewalQuestion;
  seriesTitle: string;
  /** «Llegaste a 4 de 4»; hidden when they were on no past date. */
  arrived: number;
  wasOn: number;
  busy: boolean;
  onAnswer: (join: boolean, endDay: string) => void;
}

export function RenewalQuestionCard({
  question,
  seriesTitle,
  arrived,
  wasOn,
  busy,
  onAnswer,
}: Props) {
  const c = questionCopy(question, seriesTitle);
  return (
    <View style={s.sheetBox}>
      <Text style={s.overline}>¿SIGUES EN LA SERIE?</Text>
      <Text accessibilityRole="header" style={s.sheetTitle}>
        {c.title}
      </Text>
      <Text style={s.muted}>{c.range}</Text>
      <View style={s.sheetLine}>
        <Icon color={color.accent.cool} name="calendar" size={16} />
        <View style={s.sheetLineText}>
          <Text style={s.strong}>
            {question.added === 1 ? '1 fecha nueva' : `${String(question.added)} fechas nuevas`}
          </Text>
          <Text style={s.muted}>{c.span}</Text>
        </View>
      </View>
      {wasOn > 0 && (
        <View style={s.sheetLine}>
          <Icon color={color.accent.primary} name="check" size={16} />
          <View style={s.sheetLineText}>
            <Text style={s.strong}>
              Llegaste a {arrived} de {wasOn}
            </Text>
            <Text style={s.muted}>hasta hoy</Text>
          </View>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          onAnswer(true, c.endDay);
        }}
        style={[s.secondary, busy && s.off]}
      >
        <Text style={s.secondaryText}>{c.yes}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          onAnswer(false, c.endDay);
        }}
        style={[s.secondary, busy && s.off]}
      >
        <Text style={s.secondaryText}>{c.no}</Text>
      </Pressable>
      <Text style={s.muted}>{c.note}</Text>
    </View>
  );
}
