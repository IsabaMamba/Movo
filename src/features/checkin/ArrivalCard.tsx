/**
 * «Tu próxima» with «Llegué» (Asistencia v2, phones 1–2).
 *
 * The participant marks their own arrival with the session's 4-digit code,
 * which only the organizer has. The button is there all day so people know
 * it exists, and says when it opens: from 15 minutes before the start to 45
 * after, the same window self_check_in() enforces (0033).
 *
 * A plain numeric field rather than a drawn keypad: the phone's own keypad
 * is bigger, familiar, and works with a screen reader without help.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { formatSessionTime, type MyParticipation } from '../../lib/activities';
import {
  checkInWindow,
  cleanCode,
  CLOSES_MINUTES_AFTER,
  OPENS_MINUTES_BEFORE,
  outcomeText,
  selfCheckIn,
} from '../../lib/checkIn';
import { supabase } from '../../lib/supabase';
import { checkInStyles as s } from './styles';

interface Props {
  entry: MyParticipation;
  onChanged: () => void;
}

export function ArrivalCard({ entry, onChanged }: Props) {
  const router = useRouter();
  const { activity } = entry;
  const [now, setNow] = useState(() => new Date());
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // The window opens while the screen is open; re-read the clock.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const phase = checkInWindow(activity.starts_at, now);
  const attended = entry.status === 'attended';
  const minutesToStart = Math.round(
    (new Date(activity.starts_at).getTime() - now.getTime()) / 60_000,
  );

  const send = (value: string) => {
    if (busy || value.length !== 4) return;
    setBusy(true);
    setMessage(null);
    selfCheckIn(supabase, activity.id, value)
      .then((outcome) => {
        setMessage({
          text: outcomeText(outcome),
          ok: outcome === 'checked_in' || outcome === 'already',
        });
        if (outcome === 'checked_in' || outcome === 'already') {
          setTyping(false);
          onChanged();
        } else {
          setCode('');
        }
      })
      .catch((cause: unknown) => {
        setMessage({
          text: cause instanceof Error ? cause.message : 'No se pudo marcar tu llegada.',
          ok: false,
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.next}>
      <Text style={s.eyebrow}>
        TU PRÓXIMA
        {phase === 'open'
          ? minutesToStart > 0
            ? ` · empieza en ${minutesToStart} min`
            : ' · ahora'
          : ''}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityHint="Abre la sesión"
        onPress={() => {
          router.push({ pathname: '/sesion/[id]', params: { id: activity.id } });
        }}
      >
        <Text style={s.time}>{formatSessionTime(activity.starts_at)}</Text>
        <Text style={s.title}>{activity.title}</Text>
        <Text style={s.meta}>
          {activity.location.name}
          {activity.location.district ? `, ${activity.location.district}` : ''}
        </Text>
      </Pressable>

      {attended ? (
        <Text accessibilityRole="alert" style={s.ok}>
          Tu llegada quedó marcada.
        </Text>
      ) : typing ? (
        <View style={{ gap: 8 }}>
          <Text style={s.meta}>
            Escribe el código de hoy. Lo tiene quien organiza: pídeselo o míralo en su teléfono.
          </Text>
          <TextInput
            accessibilityLabel="Código de hoy, cuatro números"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            onChangeText={(text) => {
              const clean = cleanCode(text);
              setCode(clean);
              if (clean.length === 4) send(clean);
            }}
            style={s.codeInput}
            value={code}
          />
          <View style={s.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={() => {
                setTyping(false);
                setCode('');
                setMessage(null);
              }}
              style={s.secondary}
            >
              <Text style={s.secondaryText}>{busy ? 'Revisando…' : 'Cancelar'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Llegué"
          accessibilityHint="Pide el código de hoy para marcar tu llegada"
          aria-disabled={phase !== 'open'}
          disabled={phase !== 'open'}
          onPress={() => {
            setMessage(null);
            setTyping(true);
          }}
          style={[s.arrive, phase !== 'open' && s.arriveDisabled]}
        >
          <Text style={s.arriveText}>✋ Llegué</Text>
        </Pressable>
      )}

      {message !== null && (
        <Text accessibilityRole="alert" style={message.ok ? s.ok : s.bad}>
          {message.text}
        </Text>
      )}
      {!attended && !typing && (
        <Text style={s.note}>
          {phase === 'late'
            ? 'Ya pasó el tiempo para marcar tu llegada. Si llegaste, pídele a quien organiza que te marque.'
            : `Disponible desde ${OPENS_MINUTES_BEFORE} minutos antes hasta ${CLOSES_MINUTES_AFTER} minutos después del inicio.`}
        </Text>
      )}
    </View>
  );
}
