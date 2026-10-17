/**
 * «Código de hoy» on the organizer's roster (Asistencia v2, phone 3).
 *
 * The code is created the first time it is shown (check_in_code(), 0033)
 * and stays the same; «Cambiar el código» draws a different one for when it
 * travelled beyond the people standing there. Hidden until asked for, so it
 * is not on screen while the organizer hands the phone around.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchCheckInCode, newCheckInCode } from '../../lib/checkIn';
import { supabase } from '../../lib/supabase';
import { checkInStyles as s } from './styles';

interface Props {
  activityId: string;
  arrived: number;
  total: number;
}

export function CodePanel({ activityId, arrived, total }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (call: typeof fetchCheckInCode) => {
    setBusy(true);
    setError(null);
    call(supabase, activityId)
      .then(setCode)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el código.');
      })
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  };

  const share = total === 0 ? 0 : Math.min(1, arrived / total);

  return (
    <View style={s.codePanel}>
      <Text style={s.codeLabel}>CÓDIGO DE HOY</Text>
      {code === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mostrar el código de hoy"
          aria-busy={busy}
          disabled={busy}
          onPress={() => {
            run(fetchCheckInCode);
          }}
          style={s.arrive}
        >
          <Text style={s.arriveText}>{busy ? 'Un momento…' : 'Mostrar el código'}</Text>
        </Pressable>
      ) : (
        <>
          <Text
            accessibilityLabel={`Código de hoy: ${code.split('').join(' ')}`}
            selectable
            style={s.codeDigits}
          >
            {code}
          </Text>
          <Text style={s.codeNote}>
            Dilo en voz alta o muestra esta pantalla. Quien llega lo escribe en su teléfono al tocar
            «Llegué». Es distinto en cada sesión.
          </Text>
          {confirming ? (
            <View style={{ gap: 8 }}>
              <Text style={s.codeNote}>
                El código de ahora deja de servir. Quien ya marcó su llegada no pierde nada.
              </Text>
              <View style={s.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sí, cambiar el código"
                  disabled={busy}
                  onPress={() => {
                    run(newCheckInCode);
                  }}
                  style={s.secondary}
                >
                  <Text style={s.secondaryText}>{busy ? '…' : 'Sí, cambiarlo'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="No cambiar el código"
                  onPress={() => {
                    setConfirming(false);
                  }}
                  style={s.secondary}
                >
                  <Text style={s.secondaryText}>No</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cambiar el código"
              accessibilityHint="Para cuando el código llegó a gente que no está aquí"
              onPress={() => {
                setConfirming(true);
              }}
            >
              <Text style={s.undo}>Cambiar el código</Text>
            </Pressable>
          )}
        </>
      )}
      {error !== null && (
        <Text accessibilityRole="alert" style={s.bad}>
          {error}
        </Text>
      )}

      <View style={s.progressRow}>
        <Text style={s.progressText}>
          {arrived} de {total} llegaron
        </Text>
        <Text style={s.progressNote}>se actualiza sola</Text>
      </View>
      <View style={s.progress}>
        <View style={[s.progressFill, { width: `${share * 100}%` }]} />
      </View>
    </View>
  );
}
