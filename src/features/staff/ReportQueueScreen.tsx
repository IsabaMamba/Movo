/**
 * The report queue.
 *
 * One real report has been sitting `open` since 15 September and nobody could
 * read it: until 0012 there was no role and no read policy outside
 * `service_role`, so the only reader was the Supabase panel. docs/security.md
 * puts it plainly — a report nobody reads is theatre. This screen is the
 * reader.
 *
 * What it does NOT do is act. `resolve_report()` records a judgement: a state,
 * who decided it, when, and a note. Cancelling somebody else's session, hiding
 * a profile and blocking an account are three separate powers with three
 * different blast radii, and none of them exists yet — in the database or
 * here. Every control on this screen says so, because a moderation tool that
 * looks like it removed something is worse than one that admits it did not.
 *
 * Accessibility note that applies to the whole file: `react-native-web`
 * silently drops `accessibilityState`, so selected, busy and disabled states
 * on the existing screens never reach the web DOM at all. The `aria-*` props
 * are used instead — React Native types them, maps them onto
 * `accessibilityState` on native, and react-native-web forwards them to the
 * DOM. The rest of the app has the defect; this screen does not copy it.
 */

import { Link, Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatSessionTime } from '../../lib/activities';
import {
  fetchReportQueue,
  isResolved,
  REPORT_STATUS_LABEL,
  REPORT_SUBJECT_LABEL,
  reportReasonLabel,
  resolveReport,
  waitingLabel,
  type QueuedReport,
  type QueueView,
} from '../../lib/reports';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { staffStyles as s } from './styles';

/** Chips and row actions render at `size.controlSm`; the target is padded to 44. */
const CONTROL_HIT_SLOP = hitSlopFor(size.controlSm);

/**
 * The sentence every consequential control on this screen repeats.
 *
 * It is the one thing a reviewer can get wrong in a way that hurts somebody:
 * pressing «Actuar», believing the session is now cancelled, and walking away.
 */
const RECORD_ONLY =
  'Deja constancia de la decisión. Desde acá no se cancela la sesión, ni se oculta un perfil, ni se bloquea una cuenta.';

/**
 * Why `actioned` demands a note and `dismissed` does not.
 *
 * Both write the same column. The difference is what the column is for in each
 * case. «Descartar» says there is nothing here, and the record already says
 * that — the status, who decided it and when are the whole story, and forcing
 * somebody to type "nada que hacer" forty times produces forty rows of noise.
 * «Actuar» says the team did something about a person, and `action_taken` is
 * the ONLY place that says what: with it empty, the row records that an
 * account was acted on and gives no reason, to the next reviewer or to anyone
 * asking later. So the note is the action's evidence, and it is required.
 */
const NOTE_REQUIRED_FOR = 'actioned' as const;

/**
 * `reports.action_taken` has no length check in the schema, unlike `details`,
 * which the migration caps at 2000. This limit is the screen's own and it is
 * short on purpose — the note is a record of what was decided, not a case
 * file. Same cap as the cancellation reason on the roster screen.
 */
const NOTE_LIMIT = 280;

type Intent = 'actioned' | 'dismissed';

interface Composing {
  reportId: string;
  intent: Intent;
}

/** Whether a screen reader should interrupt for this, or wait its turn. */
interface Banner {
  text: string;
  live: 'assertive' | 'polite';
  bad: boolean;
}

const CONFIRM_TEXT: Record<Intent, string> = {
  actioned: `«Actuar» deja registrado que el equipo tomó una decisión sobre esto. Escribe qué se hizo: es lo único que lo va a explicar después. ${RECORD_ONLY} No se puede deshacer.`,
  dismissed: `«Descartar» deja registrado que no hay nada que hacer acá. La nota es opcional. ${RECORD_ONLY} No se puede deshacer.`,
};

const RESULT_TEXT = {
  reviewing: 'Quedó marcado como en revisión. A quien reportó no le llega nada todavía.',
  actioned:
    'Quedó registrado que el equipo actuó, con tu nota. A quien reportó le llega que su reporte fue revisado, sin el detalle. Lo encuentras en Resueltos.',
  dismissed:
    'Quedó descartado. A quien reportó le llega que su reporte fue revisado, sin el detalle. Lo encuentras en Resueltos.',
} as const;

const VIEW_LABEL: Record<QueueView, string> = {
  pending: 'Por revisar',
  resolved: 'Resueltos',
};

export function ReportQueueScreen() {
  const { session, loading } = useAuth();

  const [view, setView] = useState<QueueView>('pending');
  const [reports, setReports] = useState<QueuedReport[] | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [composing, setComposing] = useState<Composing | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setReports(await fetchReportQueue(supabase, view));
  }, [userId, view]);

  useEffect(() => {
    let cancelled = false;
    setReports(null);

    load().catch((cause: unknown) => {
      if (cancelled) return;
      setReports([]);
      setBanner({
        text: cause instanceof Error ? cause.message : 'No se pudo cargar la cola.',
        live: 'polite',
        bad: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const apply = (reportId: string, status: 'reviewing' | Intent, text?: string) => {
    setPending(reportId);
    setBanner(null);

    resolveReport(supabase, reportId, status, text)
      .then(() => {
        setComposing(null);
        setNote('');
        // A resolution result is the one thing on this screen worth
        // interrupting for: the row it describes is usually gone by the time
        // this renders.
        setBanner({ text: RESULT_TEXT[status], live: 'assertive', bad: false });
        return load();
      })
      .catch((cause: unknown) => {
        // Including the refusals: 22023 when somebody else resolved it first,
        // 42501 when the caller turns out not to be staff after all. Both are
        // answers to the same question, so both interrupt.
        setBanner({
          text: cause instanceof Error ? cause.message : 'No se pudo guardar la decisión.',
          live: 'assertive',
          bad: true,
        });
      })
      .finally(() => {
        setPending(null);
      });
  };

  const rows = reports ?? [];

  const card = (report: QueuedReport) => {
    const busy = pending === report.id;
    const done = isResolved(report.status);
    const reviewing = report.status === 'reviewing';
    const reporter = report.reporter?.display_name ?? 'Perfil no visible';
    const composer = composing?.reportId === report.id ? composing : null;
    const needsNote = composer?.intent === NOTE_REQUIRED_FOR;
    const ready = !needsNote || note.trim().length > 0;

    const badgeStyle = done ? s.badgeDone : reviewing ? s.badgeReviewing : s.badgeOpen;
    const badgeTextStyle = done
      ? s.badgeDoneText
      : reviewing
        ? s.badgeReviewingText
        : s.badgeOpenText;

    const spoken = [
      REPORT_STATUS_LABEL[report.status],
      waitingLabel(report.created_at),
      REPORT_SUBJECT_LABEL[report.subject_type],
      reportReasonLabel(report.reason),
      report.details ?? 'Sin detalle escrito',
      `Reportó ${reporter}, el ${formatSessionTime(report.created_at)}`,
      ...(report.activity
        ? [
            `Sesión reportada: ${report.activity.title}`,
            formatSessionTime(report.activity.starts_at),
            `organiza ${report.activity.organizer?.display_name ?? 'perfil no visible'}`,
          ]
        : []),
    ].join('. ');

    return (
      <View key={report.id} style={s.card}>
        {/* One label for the report, because the reason, the free text, who
            sent it and what it is about are one fact read together — and no
            useful one read apart. The buttons stay outside this group so they
            keep their own place in the tab order. */}
        <View accessible accessibilityLabel={spoken}>
          <View style={s.cardTop}>
            <View aria-hidden style={[s.badge, badgeStyle]}>
              <Text style={[s.badgeText, badgeTextStyle]}>
                {REPORT_STATUS_LABEL[report.status]}
              </Text>
            </View>
            {!done && (
              <Text aria-hidden style={s.waiting}>
                {waitingLabel(report.created_at)}
              </Text>
            )}
          </View>

          <Text style={s.eyebrow}>{REPORT_SUBJECT_LABEL[report.subject_type]}</Text>
          <Text style={s.reason}>{reportReasonLabel(report.reason)}</Text>

          {report.details ? (
            <Text style={s.details}>«{report.details}»</Text>
          ) : (
            <Text style={s.noDetails}>Sin detalle escrito.</Text>
          )}

          <Text style={s.meta}>
            Reportó {reporter} · {formatSessionTime(report.created_at)}
          </Text>

          {/* The reported thing, next to the report. "Comportamiento" over a
              bare uuid is not something anybody can act on. */}
          {report.subject_type === 'activity' ? (
            <View style={s.subject}>
              {report.activity ? (
                <>
                  <Text style={s.subjectTitle}>{report.activity.title}</Text>
                  <Text style={s.subjectMeta}>
                    {formatSessionTime(report.activity.starts_at)} · organiza{' '}
                    {report.activity.organizer?.display_name ?? 'perfil no visible'}
                  </Text>
                </>
              ) : (
                /* `activities_read` was never widened for staff, so a session
                   that was cancelled, left as a draft or made community-only
                   is unreadable here — which is exactly the session most
                   likely to have been reported. Saying so beats a blank. */
                <Text style={s.subjectMissing}>
                  No podemos abrir la sesión reportada ({report.subject_id.slice(0, 8)}). Puede que
                  la hayan cancelado o que sea de un grupo privado: la política de lectura de
                  sesiones todavía no incluye al equipo. Búscala en el panel.
                </Text>
              )}
            </View>
          ) : (
            <View style={s.subject}>
              <Text style={s.subjectMissing}>
                Movo todavía no muestra acá lo que se reportó cuando no es una sesión (
                {report.subject_id.slice(0, 8)}). Búscalo en el panel.
              </Text>
            </View>
          )}
        </View>

        {done ? (
          /* The audit trail, which is the reason reviewed_by and reviewed_at
             exist. resolve_report() refuses a report in this state, so there
             is no button here to press — rather than one that throws. */
          <View style={s.resolution}>
            <Text style={s.meta}>
              {REPORT_STATUS_LABEL[report.status]} por{' '}
              {report.reviewer?.display_name ?? 'alguien del equipo'}
              {report.reviewed_at ? ` · ${formatSessionTime(report.reviewed_at)}` : ''}
            </Text>
            {report.action_taken ? (
              <Text style={s.details}>«{report.action_taken}»</Text>
            ) : (
              <Text style={s.noDetails}>Sin nota.</Text>
            )}
            <Text style={s.hint}>Ya está resuelto: no se puede volver a resolver.</Text>
          </View>
        ) : (
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                reviewing
                  ? `Ya está en revisión: ${reportReasonLabel(report.reason)}`
                  : `Marcar en revisión: ${reportReasonLabel(report.reason)}`
              }
              accessibilityHint={
                reviewing
                  ? undefined
                  : 'Dice que alguien lo tomó. A quien reportó no le llega nada.'
              }
              aria-busy={busy}
              aria-disabled={reviewing || busy}
              disabled={reviewing || busy}
              hitSlop={CONTROL_HIT_SLOP}
              onPress={() => {
                apply(report.id, 'reviewing');
              }}
              style={[s.action, (reviewing || busy) && s.actionDisabled]}
            >
              <Text style={[s.actionText, (reviewing || busy) && s.actionDisabledText]}>
                Revisando
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Descartar: ${reportReasonLabel(report.reason)}`}
              accessibilityHint={`Pide una nota opcional y confirmación. ${RECORD_ONLY} No se puede deshacer.`}
              aria-disabled={busy}
              disabled={busy}
              hitSlop={CONTROL_HIT_SLOP}
              onPress={() => {
                setComposing({ reportId: report.id, intent: 'dismissed' });
                setNote('');
              }}
              style={[s.action, busy && s.actionDisabled]}
            >
              <Text style={[s.actionText, busy && s.actionDisabledText]}>Descartar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Actuar: ${reportReasonLabel(report.reason)}`}
              accessibilityHint={`Pide una nota obligatoria y confirmación. ${RECORD_ONLY} No se puede deshacer.`}
              aria-disabled={busy}
              disabled={busy}
              hitSlop={CONTROL_HIT_SLOP}
              onPress={() => {
                setComposing({ reportId: report.id, intent: 'actioned' });
                setNote('');
              }}
              style={[s.action, busy ? s.actionDisabled : s.actionGrave]}
            >
              <Text style={[s.actionText, busy ? s.actionDisabledText : s.actionGraveText]}>
                Actuar
              </Text>
            </Pressable>
          </View>
        )}

        {composer && (
          <View style={s.confirm}>
            {/* Polite, not assertive: the reviewer pressed the button that put
                this here, so it is not news arriving unannounced. */}
            <Text accessibilityRole="alert" aria-live="polite" style={s.confirmText}>
              {CONFIRM_TEXT[composer.intent]}
            </Text>

            <TextInput
              accessibilityLabel={needsNote ? 'Qué se hizo' : 'Nota, opcional'}
              accessibilityHint="Queda guardada en el reporte. Quien reportó no la ve."
              maxLength={NOTE_LIMIT}
              multiline
              onChangeText={setNote}
              placeholder={
                needsNote
                  ? 'Qué hizo el equipo con esto'
                  : 'Por qué no hay nada que hacer (opcional)'
              }
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={note}
            />
            <Text style={s.counter}>
              {note.length}/{NOTE_LIMIT}
            </Text>

            <View style={s.confirmRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  composer.intent === 'actioned' ? 'Registrar que se actuó' : 'Registrar descartado'
                }
                accessibilityHint={
                  ready
                    ? `${RECORD_ONLY} No se puede deshacer.`
                    : 'Escribe primero qué se hizo: sin la nota no queda constancia de nada.'
                }
                aria-busy={busy}
                aria-disabled={!ready || busy}
                disabled={!ready || busy}
                onPress={() => {
                  apply(report.id, composer.intent, note);
                }}
                style={[s.confirmButton, (!ready || busy) && s.actionDisabled]}
              >
                <Text style={[s.confirmButtonText, (!ready || busy) && s.actionDisabledText]}>
                  {busy
                    ? 'Guardando…'
                    : composer.intent === 'actioned'
                      ? 'Registrar que se actuó'
                      : 'Registrar descartado'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                /* "Volver" reads as navigation; here it abandons the decision. */
                accessibilityHint="Cancela la decisión y deja el reporte como está"
                hitSlop={CONTROL_HIT_SLOP}
                onPress={() => {
                  setComposing(null);
                  setNote('');
                }}
                style={s.backButton}
              >
                <Text style={s.actionText}>Volver</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Reportes</Text>
        <Text style={s.subtitle}>
          Lo más viejo primero: el reporte que lleva más esperando es el más urgente, que es lo
          contrario de cualquier otra lista de Movo.
        </Text>
      </View>

      <Text style={s.hint}>{RECORD_ONLY}</Text>

      {/*
        Two views rather than one list.

        Resolved reports are kept reachable — reviewed_by and reviewed_at are
        an audit trail and an audit trail nobody can read is the same mistake
        this migration just fixed — but they are not mixed into the work.
        Mixed in, a queue of four hundred finished rows buries the three that
        are still waiting, and the whole point of the ordering is that
        somebody is waiting. So: «Por revisar» is the job, «Resueltos» is the
        record, and the record has no buttons because the function refuses it.
      */}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Qué parte de la cola"
        style={s.filterRow}
      >
        {(['pending', 'resolved'] as const).map((option) => {
          const on = view === option;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={VIEW_LABEL[option]}
              aria-selected={on}
              hitSlop={CONTROL_HIT_SLOP}
              key={option}
              onPress={() => {
                setComposing(null);
                setNote('');
                setBanner(null);
                setView(option);
              }}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>{VIEW_LABEL[option]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/*
        On Android and on the web the live region is enough. On iOS neither
        `accessibilityRole="alert"` nor `aria-live` announces anything on its
        own — VoiceOver needs AccessibilityInfo.announceForAccessibility(), and
        this screen does not call it. A reviewer on iOS has to move focus here
        to hear the result. Worth fixing across the app in one pass rather than
        one screen inventing its own announcer.
      */}
      {banner && (
        <View style={[s.banner, banner.bad && s.bannerBad]}>
          <Text
            accessibilityRole="alert"
            aria-live={banner.live}
            style={[s.bannerText, banner.bad && s.bannerTextBad]}
          >
            {banner.text}
          </Text>
        </View>
      )}

      {reports === null ? (
        <ActivityIndicator aria-busy aria-label="Cargando la cola" />
      ) : rows.length === 0 ? (
        /*
          Empty and denied look the same on purpose, and cannot be told apart
          from here: `staff` has no grants at all, so there is nothing to
          query about the caller's own role. A non-staff reader gets zero rows
          from `reports_read_staff`, not an error — the database is the
          boundary, and any check written here would only be decoration in
          front of it. What this state owes the reader is honesty about that.
        */
        <View style={s.empty}>
          <Text style={s.sectionTitle}>No hay nada en esta cola</Text>
          <Text style={s.emptyBody}>
            {view === 'pending'
              ? 'No hay reportes sin resolver.'
              : 'Todavía no se resolvió ningún reporte.'}
          </Text>
          <Text style={s.emptyBody}>
            Esta pantalla muestra lo que la base de datos te deja leer. Si no estás en el equipo de
            Movo no vas a ver ningún reporte acá, y tampoco un error: no es una pantalla rota, es el
            permiso.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          <Text style={s.hint}>
            {rows.length} {rows.length === 1 ? 'reporte' : 'reportes'}
          </Text>
          {rows.map((report) => card(report))}
        </View>
      )}
    </ScrollView>
  );
}
