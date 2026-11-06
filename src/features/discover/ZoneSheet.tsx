/**
 * One zone, by sport (Deportes v2 · 2, 0051).
 *
 * «Tibás y alrededores · esta semana», how many sessions of the sports in the
 * filter and how many people are going — «menos de 5» below five — and a bar
 * per sport in its family colour. «Ver las N sesiones» filters the list to the
 * zone; nothing here names a person or a venue.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import {
  fetchZoneSummary,
  sportBars,
  zoneHeadline,
  zoneTitle,
  type ZoneSummary,
} from '../../lib/zoneSummary';
import { color } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { discoverStyles as s } from './styles';

interface Props {
  zone: { code: string; name: string };
  /** Null for «Todo». */
  sports: readonly string[] | null;
  /** « de tus deportes», « de running», or «». */
  of: string;
  categories: readonly Category[];
  onShow: (summary: ZoneSummary) => void;
  onClose: () => void;
}

export function ZoneSheet({ zone, sports, of, categories, onShow, onClose }: Props) {
  const [summary, setSummary] = useState<ZoneSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const key = sports?.join(',') ?? '';

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setFailed(false);
    fetchZoneSummary(supabase, zone.code, key ? key.split(',') : null)
      .then((row) => {
        if (!cancelled) setSummary(row);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [zone.code, key]);

  const name = (id: string) => categories.find((c) => c.id === id)?.name_es ?? id;

  return (
    <View accessibilityLabel={`Resumen de ${zone.name}`} style={s.zoneSheet}>
      <View style={s.zoneHead}>
        <Text accessibilityRole="header" style={s.zoneTitle}>
          {summary ? zoneTitle(summary) : zone.name}
        </Text>
        <Text style={s.zoneWhen}>esta semana</Text>
      </View>

      {failed ? (
        <Text style={s.zoneLine}>No se pudo cargar el resumen de esta zona.</Text>
      ) : summary === null ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={s.zoneLine}>{zoneHeadline(summary, of)}</Text>
          {sportBars(summary.sports).map((bar) => (
            <View
              accessibilityLabel={`${name(bar.category_id)}: ${String(bar.sessions)}`}
              accessible
              key={bar.category_id}
              style={s.zoneBarRow}
            >
              <Text numberOfLines={1} style={s.zoneBarName}>
                {name(bar.category_id)}
              </Text>
              <View style={s.zoneBarTrack}>
                <View
                  style={[
                    s.zoneBarFill,
                    {
                      backgroundColor: sportColor(bar.category_id, color.accent.cool),
                      width: `${Math.round(bar.share * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.zoneBarCount}>{bar.sessions}</Text>
            </View>
          ))}
          <Text style={s.zoneNote}>
            El calor del mapa suma todas las sesiones públicas. Este resumen cuenta solo los
            deportes del filtro, y no dice cuántas personas van si son menos de 5.
          </Text>
        </>
      )}

      <View style={s.zoneActions}>
        {summary !== null && summary.sessions > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onShow(summary);
            }}
            style={s.zonePrimary}
          >
            <Text style={s.zonePrimaryText}>
              {summary.sessions === 1
                ? 'Ver la sesión'
                : `Ver las ${String(summary.sessions)} sesiones`}
            </Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onClose} style={s.zoneSecondary}>
          <Text style={s.zoneSecondaryText}>Cerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}
