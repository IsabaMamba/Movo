/**
 * Modo solo.
 *
 * From docs/design/roles-ia.html, state C: nobody opened the session, and it
 * does not disappear — you can still go. With zero users every session ends in
 * C, so this is the normal state at launch rather than the exception, and it
 * is the only thing in the product that works with no other users and no
 * signal.
 *
 * The plan is held locally and never written to the database. A solo outing is
 * not a session: giving it an `activities` row would put a fake event in
 * Descubrir and in somebody's organizer list, which is exactly the pretence
 * the design rejects.
 */

import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchPublicVenues } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { color, locale, timeZone } from '../../theme';
import type { Location } from '../../types/database';
import { soloStyles as s } from './styles';

/** Survives a cold start with no signal — the point of the mode. */
const PLAN_KEY = 'movo.solo.plan';

const DURATIONS = [30, 45, 60, 90] as const;

interface StoredPlan {
  venueId: string;
  venueName: string;
  minutes: number;
  note: string;
}

/**
 * 24-hour, matching how the product writes times everywhere else — the design
 * says "18:00", not "6:00 p.m.". It also avoids a sentence ending "20:25 p.m..",
 * because the es-419 afternoon marker already carries its own full stop.
 */
function clockAt(date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

export function SoloScreen() {
  const [venues, setVenues] = useState<Location[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number>(45);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Cached plan first, so the screen is useful before the network answers —
    // and still useful if it never does.
    AsyncStorage.getItem(PLAN_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const plan = JSON.parse(raw) as StoredPlan;
        setVenueId(plan.venueId);
        setMinutes(plan.minutes);
        setNote(plan.note);
      })
      .catch(() => {
        // A corrupt or missing plan is not worth surfacing; the form has defaults.
      });

    fetchPublicVenues(supabase)
      .then((rows) => {
        if (cancelled) return;
        setVenues(rows);
        setVenueId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setVenues([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const venue = venues?.find((v) => v.id === venueId) ?? null;
  const now = new Date();
  const back = new Date(now.getTime() + minutes * 60_000);

  useEffect(() => {
    if (!venue) return;
    const plan: StoredPlan = { venueId: venue.id, venueName: venue.name, minutes, note };
    void AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan)).catch(() => {
      // Storage can be unavailable in a private window; the plan just is not
      // remembered, which is not worth interrupting anyone over.
    });
  }, [venue, minutes, note]);

  const message = venue
    ? `Voy a ${venue.name}${venue.district ? ` (${venue.district})` : ''}. ` +
      `Salgo ${clockAt(now)} y calculo volver ${clockAt(back)}.` +
      (note.trim() ? ` ${note.trim()}` : '') +
      ' Si no te aviso para esa hora, escribime.'
    : '';

  const share = () => {
    setCopied(false);
    Share.share({ message }).catch(() => {
      // Web without navigator.share, or a dismissed sheet. Copy still works.
    });
  };

  const copy = () => {
    Clipboard.setStringAsync(message)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Igual podés ir</Text>
        <Text style={s.subtitle}>
          Nadie abrió una sesión cerca. Eso no significa quedarse en casa — significa ir por tu
          cuenta, avisando.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Text style={s.sectionTitle}>¿Adónde vas?</Text>
        {venues === null ? (
          <ActivityIndicator />
        ) : venues.length === 0 ? (
          <Text style={s.hint}>No hay lugares públicos cargados todavía.</Text>
        ) : (
          venues.map((v) => {
            const on = venueId === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  setVenueId(v.id);
                }}
                style={[s.venue, on && s.venueOn]}
              >
                <Text style={s.venueName}>{v.name}</Text>
                <Text style={s.venueMeta}>{v.district ?? 'Sin distrito'} · lugar público</Text>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={s.field}>
        <Text style={s.label}>¿Cuánto vas a estar?</Text>
        <View style={s.chipRow}>
          {DURATIONS.map((option) => {
            const on = minutes === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  setMinutes(option);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{option} min</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {venue && (
        <View style={s.summary}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{clockAt(now)}</Text>
              <Text style={s.summaryLabel}>salís</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{clockAt(back)}</Text>
              <Text style={s.summaryLabel}>volvés</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{minutes} min</Text>
              <Text style={s.summaryLabel}>en total</Text>
            </View>
          </View>
        </View>
      )}

      {/* The part the design refuses to treat as secondary. */}
      <View style={s.tell}>
        <Text style={s.tellTitle}>Avisar a alguien</Text>
        <Text style={s.tellWhy}>
          Salir solo o sola, temprano o de noche, es lo más riesgoso que esta app te puede sugerir.
          Compartí a dónde vas y a qué hora volvés con alguien de confianza.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>Algo más que quieras agregar</Text>
          <TextInput
            onChangeText={(text) => {
              setNote(text);
              setCopied(false);
            }}
            placeholder="Voy por el sendero del norte."
            placeholderTextColor={color.text.tertiary}
            style={s.input}
            value={note}
          />
        </View>

        {message ? <Text style={s.message}>{message}</Text> : null}

        <View style={s.actionRow}>
          <Pressable disabled={!message} onPress={share} style={s.primary}>
            <Text style={s.primaryText}>Compartir</Text>
          </Pressable>
          <Pressable disabled={!message} onPress={copy} style={s.secondary}>
            <Text style={s.secondaryText}>{copied ? 'Copiado' : 'Copiar'}</Text>
          </Pressable>
        </View>
      </View>

      {copied && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Copiado. Mandáselo a alguien antes de salir, no cuando ya vas en camino.
          </Text>
        </View>
      )}

      {/*
        The design also specifies an offline map, the route, and route-specific
        tips. None are built, and inventing the tips would be worse than
        omitting them: "el tramo del kilómetro 3 no tiene alumbrado" is a
        safety claim about a real place, and a wrong one gets somebody hurt.
      */}
      <View style={s.pending}>
        <Text style={s.pendingTitle}>Todavía no</Text>
        <Text style={s.pendingBody}>
          El mapa sin conexión, la ruta y los consejos por tramo son parte de modo solo y aún no
          existen. Los consejos son conocimiento local — alumbrado, bebederos, a qué hora hay gente
          — y se escriben, no se inventan.
        </Text>
      </View>

      <Text style={s.hint}>
        Nada de esto se guarda en Movo. Tu plan queda en este dispositivo y funciona sin señal.
      </Text>
    </ScrollView>
  );
}
