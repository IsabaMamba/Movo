/**
 * /registro — the four steps after the account exists (Registro v3 · 4–15).
 *
 *   1. Sobre ti: name and date of birth. A real date under 18 shows «Movo es
 *      para mayores de 18»; «Entendido» deletes the account in the database
 *      (`set_about_me`) and signs out. Nothing of it stays.
 *   2. Tu género: why it is asked, said where it is asked.
 *   3. ¿Qué te gusta hacer?: the nineteen by family, as many as ten.
 *   4. ¿Dónde te mueves?: one screen with one button before the phone's
 *      dialog — Apple refuses a «Ahora no» there (guideline 5.1.1(iv)). Yes:
 *      the distrito and how far to search. No, or outside Costa Rica: the
 *      person types their zone and everything works the same.
 *
 * Then the five rules that matter most, `finish_signup()`, and «Te avisamos
 * lo importante» before the notification dialog, again with one button.
 *
 * The steps resume where the person left (`firstStep`): an Apple account that
 * closed the app on step 3 comes back to step 3.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { fetchCategories } from '../../lib/activities';
import { NAME_MAX, NAME_MIN } from '../../lib/account';
import { MIN_AGE } from '../../lib/age';
import { fetchMyConsents, inForce, recordConsent, rulesStatus } from '../../lib/consents';
import { GENDER_OPTIONS, GENDER_PURPOSE, setMyGender, type Gender } from '../../lib/gender';
import { LOCATION_NOTICE_VERSION, requestCoarseOrigin } from '../../lib/location';
import {
  fetchDistrictOptions,
  MAX_SPORTS,
  searchDistricts,
  type DistrictOption,
} from '../../lib/profile';
import { enablePush, PUSH_NOTICE_VERSION } from '../../lib/push';
import {
  birthStep,
  DEFAULT_RADIUS,
  districtFromPoint,
  fetchSignupStatus,
  finishSignup,
  firstStep,
  NUMBERED_STEPS,
  RADIUS_CHOICES,
  radiusLine,
  RULES_TOP_FIVE,
  setAboutMe,
  setDistrict,
  setMySports,
  setSearchRadius,
  stepLabel,
  zoneLabel,
  type RadiusKm,
  type SignupStatus,
  type SignupStep,
  type Zone,
} from '../../lib/signup';
import { byFamily } from '../../lib/sports';
import { supabase } from '../../lib/supabase';
import { color } from '../../theme';
import { FAMILY_NAME, FAMILY_TEXT_COLOR, sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { authStyles as a } from '../auth/styles';
import { Icon } from '../nav/Icon';
import { RULES_VERSION } from '../rules/rules';
import { useSignupGate } from './SignupGate';
import { signupStyles as s } from './styles';

type ZonePhase = 'explain' | 'found' | 'typing';

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function SignupStepsScreen() {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const { markDone } = useSignupGate();

  const [status, setStatus] = useState<SignupStatus | null | undefined>(undefined);
  const [screen, setScreen] = useState<SignupStep>('about');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // Step 2
  const [gender, setGender] = useState<Gender | null>(null);
  // Step 3
  const [categories, setCategories] = useState<Category[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  // Step 4
  const [zonePhase, setZonePhase] = useState<ZonePhase>('explain');
  const [zone, setZone] = useState<Zone | null>(null);
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [zoneNote, setZoneNote] = useState<string | null>(null);
  const [options, setOptions] = useState<DistrictOption[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<DistrictOption | null>(null);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchSignupStatus(supabase), fetchMyConsents(supabase).catch(() => [])])
      .then(([st, consents]) => {
        if (cancelled) return;
        setStatus(st);
        if (st === null) return;
        const accepted = rulesStatus(inForce(consents).rules, RULES_VERSION) === 'current';
        const first = firstStep(st, accepted);
        if (first === 'push') {
          // Everything is done: this is somebody opening /registro again.
          markDone();
          router.replace('/');
          return;
        }
        setName(st.displayName);
        setGender(st.gender);
        if (st.district) {
          setZone(st.district);
          setRadius(st.radiusKm);
        }
        setScreen(first);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus(null);
          setError(errorText(cause, 'No pudimos cargar tu cuenta.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, markDone, router]);

  useEffect(() => {
    if (screen === 'sports' && categories.length === 0) {
      fetchCategories(supabase)
        .then(setCategories)
        .catch(() => {
          setError('No pudimos cargar los deportes. Revisa tu conexión.');
        });
    }
    if (screen === 'zone' && options.length === 0) {
      fetchDistrictOptions(supabase)
        .then(setOptions)
        .catch(() => undefined);
    }
  }, [screen, categories.length, options.length]);

  const go = useCallback((next: SignupStep) => {
    setError(null);
    setScreen(next);
  }, []);

  const work = useCallback((task: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    task()
      .catch((cause: unknown) => {
        setError(errorText(cause, fallback));
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  const matches = useMemo(() => searchDistricts(options, query, 6), [options, query]);

  if (loading || (userId && status === undefined)) {
    return <ActivityIndicator style={s.screen} />;
  }
  if (!session) return <Redirect href="/sign-up" />;
  if (status === null) {
    return (
      <View style={[s.screen, s.content]}>
        <Text style={s.title}>Algo no cargó</Text>
        <Text accessibilityRole="alert" style={s.error}>
          {error ?? 'No pudimos cargar tu cuenta.'}
        </Text>
      </View>
    );
  }

  // ------------------------------------------------------------- frame

  const frame = (opts: {
    /** Above the title: the bell of «Te avisamos lo importante». */
    art?: ReactNode;
    title: string;
    lead?: string;
    children?: ReactNode;
    button: string;
    enabled: boolean;
    onPress: () => void;
    footnote?: string;
  }) => {
    const label = stepLabel(screen);
    const n = NUMBERED_STEPS.indexOf(screen) + 1;
    return (
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        style={s.screen}
      >
        {label !== null ? (
          <>
            <View style={s.top}>
              <Text style={s.brand}>movo</Text>
              <Text style={s.stepOf}>{label}</Text>
            </View>
            <View accessibilityLabel={label ?? undefined} style={s.bars}>
              {NUMBERED_STEPS.map((step, i) => (
                <View key={step} style={[s.bar, i < n && s.barOn]} />
              ))}
            </View>
          </>
        ) : (
          <View style={s.top}>
            <Text style={s.brand}>movo</Text>
            <Text style={s.stepOf}>Último paso</Text>
          </View>
        )}
        {opts.art}
        <Text accessibilityRole="header" style={s.title}>
          {opts.title}
        </Text>
        {opts.lead !== undefined && <Text style={s.lead}>{opts.lead}</Text>}
        {opts.children}
        {error !== null && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={s.spacer} />
        <Pressable
          accessibilityRole="button"
          aria-disabled={!opts.enabled || busy}
          disabled={!opts.enabled || busy}
          onPress={opts.onPress}
          style={[s.button, (!opts.enabled || busy) && s.buttonOff]}
        >
          <Text style={s.buttonText}>{busy ? 'Un momento…' : opts.button}</Text>
        </Pressable>
        {opts.footnote !== undefined && <Text style={s.footnote}>{opts.footnote}</Text>}
      </ScrollView>
    );
  };

  // ---------------------------------------------------- 1 · sobre ti

  if (screen === 'about') {
    const trimmed = name.trim();
    const nameOk = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
    const birth = birthStep(day, month, year);
    const touched = day !== '' || month !== '' || year !== '';
    const minor = birth.kind === 'under_age';

    return frame({
      title: 'Sobre ti',
      // Under 18 the button is «Entendido»: the database deletes the account,
      // then there is nothing left to keep a session for. The fields stay, so
      // a mistyped year can still be fixed first.
      button: minor ? 'Entendido' : 'Seguir',
      enabled: minor || (nameOk && birth.kind === 'ok'),
      onPress: () => {
        if (birth.kind === 'under_age') {
          work(async () => {
            await setAboutMe(supabase, trimmed, birth.iso);
            await signOut().catch(() => undefined);
            router.replace('/');
          }, 'No pudimos terminar. Intenta de nuevo.');
          return;
        }
        if (birth.kind !== 'ok') return;
        work(async () => {
          const result = await setAboutMe(supabase, trimmed, birth.iso);
          if (result === 'under_age') {
            await signOut().catch(() => undefined);
            router.replace('/');
            return;
          }
          go(gender === null ? 'gender' : 'sports');
        }, 'No pudimos guardar. Intenta de nuevo.');
      },
      children: (
        <>
          <Text style={s.label}>Tu nombre</Text>
          <TextInput
            accessibilityHint={`Entre ${String(NAME_MIN)} y ${String(NAME_MAX)} caracteres.`}
            accessibilityLabel="Tu nombre"
            autoComplete="name"
            maxLength={NAME_MAX}
            onChangeText={setName}
            placeholder="Cómo te van a ver"
            placeholderTextColor={color.text.tertiary}
            style={a.input}
            value={name}
          />
          <Text style={s.hint}>
            Es el nombre que ven en las sesiones. Puedes usar solo tu nombre o un apodo.
          </Text>
          <Text style={s.label}>Fecha de nacimiento</Text>
          <View style={a.dateRow}>
            <TextInput
              accessibilityLabel="Día de nacimiento"
              autoComplete="birthdate-day"
              inputMode="numeric"
              maxLength={2}
              onChangeText={setDay}
              placeholder="Día"
              placeholderTextColor={color.text.tertiary}
              style={[a.input, a.dateDay]}
              value={day}
            />
            <TextInput
              accessibilityLabel="Mes de nacimiento, en número"
              autoComplete="birthdate-month"
              inputMode="numeric"
              maxLength={2}
              onChangeText={setMonth}
              placeholder="Mes"
              placeholderTextColor={color.text.tertiary}
              style={[a.input, a.dateDay]}
              value={month}
            />
            <TextInput
              accessibilityLabel="Año de nacimiento"
              autoComplete="birthdate-year"
              inputMode="numeric"
              maxLength={4}
              onChangeText={setYear}
              placeholder="Año"
              placeholderTextColor={color.text.tertiary}
              style={[a.input, a.dateYear]}
              value={year}
            />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={touched && birth.kind === 'problem' ? s.error : s.hint}
          >
            {touched && birth.kind === 'problem'
              ? birth.problem
              : `Solo para confirmar que tienes ${String(MIN_AGE)} o más. No aparece en tu perfil y no se puede cambiar después.`}
          </Text>
          {minor && (
            <View accessibilityLiveRegion="polite" style={s.box}>
              <Text style={s.boxTitle}>Movo es para personas mayores de {MIN_AGE}</Text>
              <Text style={s.hint}>
                Las sesiones juntan a personas que no se conocen, en persona. Por eso no podemos
                crear tu cuenta. No guardamos nada de lo que escribiste.
              </Text>
            </View>
          )}
        </>
      ),
    });
  }

  // ---------------------------------------------------- 2 · género

  if (screen === 'gender') {
    return frame({
      title: 'Tu género',
      lead: GENDER_PURPOSE,
      button: 'Seguir',
      enabled: gender !== null,
      onPress: () => {
        if (gender === null) return;
        work(async () => {
          await setMyGender(supabase, gender);
          go('sports');
        }, 'No pudimos guardar. Intenta de nuevo.');
      },
      children: (
        <View accessibilityLabel="Tu género" accessibilityRole="radiogroup" style={a.genderGroup}>
          {GENDER_OPTIONS.map((option) => {
            const on = gender === option.value;
            return (
              <Pressable
                accessibilityLabel={option.hint ? `${option.label}. ${option.hint}` : option.label}
                accessibilityRole="radio"
                aria-checked={on}
                key={option.value}
                onPress={() => {
                  setGender(option.value);
                }}
                style={[a.genderOption, on && a.genderOptionOn]}
              >
                <View style={[a.radio, on && a.radioOn]} />
                <View style={s.placeText}>
                  <Text style={a.genderLabel}>{option.label}</Text>
                  {option.hint ? <Text style={s.hint}>{option.hint}</Text> : null}
                </View>
              </Pressable>
            );
          })}
          <Text style={s.hint}>Lo puedes cambiar después en Perfil.</Text>
        </View>
      ),
    });
  }

  // ---------------------------------------------------- 3 · deportes

  if (screen === 'sports') {
    const full = sports.length >= MAX_SPORTS;
    return frame({
      title: '¿Qué te gusta hacer?',
      lead: `Elige todos los que quieras, hasta ${String(MAX_SPORTS)}. ${
        sports.length === 0
          ? 'Ninguno elegido todavía.'
          : `${String(sports.length)} ${sports.length === 1 ? 'elegido' : 'elegidos'}.`
      }`,
      button: 'Seguir',
      enabled: sports.length > 0,
      onPress: () => {
        work(async () => {
          await setMySports(supabase, sports);
          go('zone');
        }, 'No pudimos guardar tus deportes. Intenta de nuevo.');
      },
      footnote: 'El nivel de cada uno lo pones después, en tu perfil.',
      children:
        categories.length === 0 ? (
          <ActivityIndicator />
        ) : (
          byFamily(categories).map((group) => (
            <View key={group.family} style={s.family}>
              <Text style={[s.familyName, { color: FAMILY_TEXT_COLOR[group.family] }]}>
                {FAMILY_NAME[group.family].toUpperCase()}
              </Text>
              <View style={s.chips}>
                {group.sports.map((c) => {
                  const on = sports.includes(c.id);
                  return (
                    <Pressable
                      accessibilityLabel={c.name_es}
                      accessibilityRole="checkbox"
                      aria-checked={on}
                      disabled={!on && full}
                      key={c.id}
                      onPress={() => {
                        setSports((prev) =>
                          prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        );
                      }}
                      style={[s.chip, on && s.chipOn, !on && full && s.buttonOff]}
                    >
                      {on ? (
                        <Icon color={color.accent.primary} name="check" size={14} />
                      ) : (
                        <View
                          style={{
                            backgroundColor: sportColor(c.id),
                            borderRadius: 4,
                            height: 8,
                            width: 8,
                          }}
                        />
                      )}
                      <Text style={s.chipText}>{c.name_es}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        ),
    });
  }

  // ---------------------------------------------------- 4 · zona

  if (screen === 'zone') {
    if (zonePhase === 'explain' && zone === null) {
      return frame({
        title: '¿Dónde te mueves?',
        lead: 'Para sugerirte actividades cerca, usamos tu ubicación aproximada. Guardamos solo tu distrito; nadie más lo ve.',
        button: 'Seguir',
        enabled: true,
        onPress: () => {
          // One button, then the phone's own dialog (Apple 5.1.1(iv)).
          work(async () => {
            const origin = await requestCoarseOrigin();
            if (!origin.ok) {
              setZoneNote(null);
              setZonePhase('typing');
              return;
            }
            void recordConsent(supabase, 'location', LOCATION_NOTICE_VERSION, true);
            const found = await districtFromPoint(supabase, origin.point);
            if (found === null) {
              setZoneNote('No encontramos un distrito de Costa Rica donde estás. Escribe el tuyo.');
              setZonePhase('typing');
              return;
            }
            setZone(found);
            setZonePhase('found');
          }, 'No pudimos saber tu zona. Escríbela.');
        },
        children: (
          <>
            <View style={s.zoneArt}>
              <View style={s.zoneBlob} />
              <Text style={s.zoneArtText}>Tu zona, nunca tu dirección</Text>
            </View>
            <View style={s.checks}>
              {[
                'Aproximada basta: no hace falta la precisa.',
                'Solo mientras usas Movo, nunca en segundo plano.',
                'Si dices que no, nos dices tu zona y todo funciona igual.',
              ].map((line) => (
                <View key={line} style={s.check}>
                  <Icon color={color.semantic.success} name="check" size={16} />
                  <Text style={s.checkText}>{line}</Text>
                </View>
              ))}
            </View>
          </>
        ),
      });
    }

    if (zonePhase === 'typing') {
      return frame({
        title: 'Dinos tu zona',
        lead: 'Sin ubicación, buscamos desde tu zona. Escribe tu distrito o cantón.',
        button: 'Seguir',
        enabled: picked !== null,
        onPress: () => {
          if (picked === null) return;
          work(async () => {
            const z = await setDistrict(supabase, picked.code);
            setZone(z);
            go('rules');
          }, 'No pudimos guardar tu zona. Intenta de nuevo.');
        },
        footnote: 'Puedes activar la ubicación cuando quieras en Perfil › Tus permisos.',
        children: (
          <>
            {zoneNote !== null && <Text style={s.hint}>{zoneNote}</Text>}
            <Text style={s.label}>Tu zona</Text>
            <TextInput
              accessibilityLabel="Tu zona"
              autoCorrect={false}
              onChangeText={(text) => {
                setQuery(text);
                setPicked(null);
              }}
              placeholder="San Juan, Tibás"
              placeholderTextColor={color.text.tertiary}
              style={a.input}
              value={picked ? picked.label : query}
            />
            {picked === null && matches.length > 0 && (
              <View style={s.results}>
                {matches.map((option) => {
                  const [district, canton] = option.label.split(' · ');
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.code}
                      onPress={() => {
                        setPicked(option);
                      }}
                      style={s.result}
                    >
                      <Text style={s.placeName}>{district}</Text>
                      {canton ? <Text style={s.placeSub}>{canton}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ),
      });
    }

    // Found, or coming back with a zone already saved.
    const here = zone;
    return frame({
      title: here ? `Estás cerca de ${zoneLabel(here)}` : '¿Dónde te mueves?',
      button: 'Seguir',
      enabled: here !== null,
      onPress: () => {
        work(async () => {
          await setSearchRadius(supabase, radius);
          go('rules');
        }, 'No pudimos guardar. Intenta de nuevo.');
      },
      children: (
        <>
          {here && (
            <View style={s.place}>
              <Icon color={color.accent.cool} name="pin" size={20} />
              <View style={s.placeText}>
                <Text style={s.placeName}>{zoneLabel(here)}</Text>
                <Text style={s.placeSub}>Tu zona · solo tú la ves</Text>
              </View>
              <Pressable
                accessibilityLabel="Cambiar tu zona"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setPicked(null);
                  setQuery('');
                  setZoneNote(null);
                  setZonePhase('typing');
                }}
              >
                <Text style={s.placeAction}>Cambiar</Text>
              </Pressable>
            </View>
          )}
          <Text style={s.label}>¿Hasta dónde buscamos?</Text>
          <View
            accessibilityLabel="Hasta dónde buscamos"
            accessibilityRole="radiogroup"
            style={s.segment}
          >
            {RADIUS_CHOICES.map((km) => {
              const on = radius === km;
              return (
                <Pressable
                  accessibilityLabel={`${String(km)} kilómetros`}
                  accessibilityRole="radio"
                  aria-checked={on}
                  key={km}
                  onPress={() => {
                    setRadius(km);
                  }}
                  style={[s.segmentItem, on && s.segmentOn]}
                >
                  <Text style={[s.segmentText, on && s.segmentTextOn]}>{km} km</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hint}>{radiusLine(radius)}</Text>
        </>
      ),
    });
  }

  // ---------------------------------------------------- normas

  if (screen === 'rules') {
    return frame({
      title: 'Antes de entrar, cinco cosas',
      lead: 'Son las normas de la comunidad. Estas cinco son las que más importan.',
      button: 'Acepto las normas',
      enabled: true,
      footnote: 'Queda guardado con la fecha, en Perfil › Tus permisos.',
      onPress: () => {
        work(async () => {
          if (!(await recordConsent(supabase, 'rules', RULES_VERSION, true))) {
            throw new Error('No pudimos guardar que aceptaste. Intenta de nuevo.');
          }
          await finishSignup(supabase);
          markDone();
          go('push');
        }, 'No pudimos terminar. Intenta de nuevo.');
      },
      children: (
        <>
          <View>
            {RULES_TOP_FIVE.map((rule) => (
              <View key={rule.title} style={s.rule}>
                <Icon color={color.accent.cool} name={rule.icon} size={18} />
                <View style={s.ruleText}>
                  <Text style={s.placeName}>{rule.title}</Text>
                  <Text style={s.placeSub}>{rule.detail}</Text>
                </View>
              </View>
            ))}
          </View>
          <Link href="/normas" style={s.link}>
            <Text style={s.linkText}>Leer las normas completas</Text>
          </Link>
        </>
      ),
    });
  }

  // ---------------------------------------------------- avisos

  return frame({
    title: 'Te avisamos lo importante',
    lead: 'Un día antes de tu sesión, si se cancela o cambia de lugar, y si se libera un cupo que esperabas.',
    button: 'Seguir',
    enabled: true,
    onPress: () => {
      // One button, then the browser's or the phone's dialog. Whatever the
      // answer, the steps are over.
      work(async () => {
        if (Platform.OS === 'web') {
          const state = await enablePush(supabase).catch(() => 'off' as const);
          if (state === 'on') void recordConsent(supabase, 'push', PUSH_NOTICE_VERSION, true);
        }
        router.replace('/');
      }, 'No pudimos activar los avisos. Puedes hacerlo después en Perfil.');
    },
    art: (
      <View style={s.bell}>
        <Icon color={color.accent.primary} name="bell" size={28} />
      </View>
    ),
    children: (
      <>
        <View style={s.box}>
          <Text style={s.label}>EN LA PANTALLA BLOQUEADA</Text>
          <View style={s.lockRow}>
            <View style={s.appIcon}>
              <Text style={s.appIconText}>M</Text>
            </View>
            <View style={s.placeText}>
              <Text style={s.placeName}>Movo</Text>
              <Text style={s.placeSub}>Tienes un aviso nuevo en Movo.</Text>
            </View>
          </View>
          <Text style={s.hint}>
            Nunca el lugar ni la hora: quien mire tu teléfono no sabe a dónde vas.
          </Text>
        </View>
      </>
    ),
  });
}
