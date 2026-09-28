/**
 * «Avisos en este dispositivo» — the one place push is switched on or off.
 *
 * It sits on /avisos because that is where somebody is when they wish they
 * had known sooner, and it says exactly what arrives: one fixed sentence,
 * never the details. When the deployment has no VAPID key it renders nothing,
 * so an unconfigured project never offers a switch that cannot work.
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { disablePush, enablePush, getPushState, type PushState } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { pushStyles as s } from './styles';

const EXPLAIN: Record<Exclude<PushState, 'unconfigured'>, string> = {
  off: 'Si lo activas, cuando pase algo con tus sesiones te llega «Tienes un aviso nuevo en Movo», sin detalles: lo que pasó se ve aquí. Puedes apagarlo cuando quieras.',
  on: 'Activado en este dispositivo. Te llega «Tienes un aviso nuevo en Movo», sin detalles. Al cerrar sesión se apaga solo.',
  denied:
    'Bloqueaste las notificaciones de Movo en este navegador. Para activarlas, permítelas en la configuración del sitio y vuelve aquí.',
  unsupported:
    'Este navegador no permite avisos. En iPhone funcionan si agregas Movo a la pantalla de inicio.',
};

export function PushSwitch() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPushState().then((value) => {
      if (!cancelled) setState(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null || state === 'unconfigured') return null;

  const toggle = () => {
    setBusy(true);
    setError(null);
    const action =
      state === 'on' ? disablePush(supabase).then(() => getPushState()) : enablePush(supabase);
    action
      .then(setState)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo cambiar. Intenta de nuevo.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const canToggle = state === 'on' || state === 'off';

  return (
    <View style={s.panel}>
      <Text style={s.title}>Avisos en este dispositivo</Text>
      <Text style={s.body}>{EXPLAIN[state]}</Text>
      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {canToggle && (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Avisos en este dispositivo"
          aria-busy={busy}
          aria-checked={state === 'on'}
          disabled={busy}
          onPress={toggle}
          style={[s.button, state === 'on' && s.buttonOn]}
        >
          <Text style={[s.buttonText, state === 'on' && s.buttonTextOn]}>
            {busy ? '…' : state === 'on' ? 'Apagar' : 'Activar'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
