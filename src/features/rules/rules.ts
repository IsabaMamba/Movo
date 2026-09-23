/**
 * Las normas de la comunidad — the text the moderation notices cite.
 *
 * Since 0019 an organizer can be told «El equipo de Movo canceló X por no
 * cumplir las normas de la comunidad», and since 0020 an account can be
 * suspended. Both cite rules; until this file they cited nothing, which made
 * every moderation decision an opinion.
 *
 * Two constraints on editing this:
 *
 *   * **Say only what Movo actually does.** Every consequence here is a
 *     function in the database (0019, 0020), and the lengths come from
 *     `SUSPENSION_LENGTHS` so they cannot drift from the queue's buttons. A
 *     rule that promises a control nobody built is worse than no rule.
 *   * **A change of substance is a new version.** Bump `RULES_VERSION` so
 *     that "you broke the rules" can be answered with "which ones, as of
 *     when".
 */

import { SUSPENSION_LENGTHS } from '../../lib/suspensions';

/** ISO date of this text. Shown on the screen; bump it with any change of substance. */
export const RULES_VERSION = '2026-09-22';

export interface RuleSection {
  id: string;
  title: string;
  /** Each item is one rule: a short headline and the sentence that explains it. */
  items: { rule: string; detail: string }[];
}

/** «7 días, 30 días o sin fecha de fin», from the same list the queue offers. */
export function suspensionLengthsSentence(): string {
  const labels = SUSPENSION_LENGTHS.map((option, index) =>
    index === 0 ? option.label : option.label.toLowerCase(),
  );
  const last = labels.pop();
  return `${labels.join(', ')} o ${last ?? ''}`;
}

export const RULES_INTRO =
  'Movo junta a personas que no se conocen para hacer deporte en lugares públicos. Estas normas existen para que llegar sola o solo a una sesión sea seguro, y para que lo publicado sea real. Aplican a todo lo que haces en Movo: sesiones, grupos, lugares, chats y perfiles.';

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'todos',
    title: 'Para todas las personas',
    items: [
      {
        rule: 'Trata bien a la gente',
        detail:
          'Nada de insultos, humillaciones ni discriminación por origen, género, orientación sexual, religión, discapacidad, edad, cuerpo o nivel deportivo. Alguien que empieza tiene el mismo lugar que alguien que compite.',
      },
      {
        rule: 'Ni acoso ni contacto que no te pidieron',
        detail:
          'Si alguien no responde o te dice que no, ahí termina. No busques a nadie fuera de la sesión, no preguntes dónde vive o trabaja y no lo esperes al salir. Los comentarios o el contacto sexual no deseados son acoso.',
      },
      {
        rule: 'Nunca amenaces ni uses la violencia',
        detail:
          'Ni en persona, ni en el chat, ni en broma. Tampoco se permite animar a otra persona a hacerlo.',
      },
      {
        rule: 'Sé quien dices ser',
        detail:
          'Usa tu nombre, sin cuentas falsas y sin hacerte pasar por otra persona, club o marca.',
      },
      {
        rule: 'Los datos de otra persona no son tuyos',
        detail:
          'No compartas el teléfono, la dirección, las fotos ni los horarios de nadie sin su permiso.',
      },
      {
        rule: 'Si dices que vas, ve',
        detail:
          'Si al final no puedes, sal de la sesión en cuanto lo sepas: así el lugar pasa a quien está en lista de espera.',
      },
      {
        rule: 'Nada de spam',
        detail: 'Ni publicidad que nadie pidió, ni sesiones o mensajes para vender algo.',
      },
    ],
  },
  {
    id: 'organizar',
    title: 'Para quien organiza',
    items: [
      {
        rule: 'Lo que publicas es lo que pasa',
        detail:
          'Hora, lugar, nivel, dificultad y precio reales. Una sesión inventada o que nadie va a dirigir no se publica.',
      },
      {
        rule: 'Solo lugares públicos',
        detail:
          'Parques, canchas, senderos, lugares con nombre donde hay más gente. Nunca una casa, un carro ni un punto privado.',
      },
      {
        rule: 'Alguien responde',
        detail:
          'Estás ahí a la hora, o avisas. Si se cancela, cancélala en Movo y di por qué: así le llega el aviso a cada persona apuntada.',
      },
      {
        rule: 'Cobra solo lo publicado',
        detail: 'Sin cobros sorpresa en el lugar ni pagos por fuera de lo que dice la sesión.',
      },
      {
        rule: 'Marca la asistencia con honestidad',
        detail:
          'Llegó quien llegó. La asistencia es lo que los demás usan para confiar en una sesión.',
      },
    ],
  },
];

/** What the team can do, in the order it usually happens. */
export function consequenceItems(): { rule: string; detail: string }[] {
  return [
    {
      rule: 'Una persona lee cada reporte',
      detail:
        'Lo revisa alguien del equipo de Movo, en menos de 24 horas y el mismo día si la sesión es pronto o si alguien está en riesgo.',
    },
    {
      rule: 'Puede cancelar una sesión',
      detail:
        'Si una sesión no cumple estas normas, el equipo la cancela y avisa a cada persona apuntada y a quien organiza.',
    },
    {
      rule: 'Puede suspender una cuenta',
      detail: `Por ${suspensionLengthsSentence()}. Mientras dure, esa cuenta no puede crear ni unirse a sesiones, escribir en los chats ni crear grupos o lugares; su perfil deja de verse y sus sesiones futuras se cancelan.`,
    },
    {
      rule: 'Nunca decimos quién reportó',
      detail:
        'Ni a la persona reportada ni a nadie de la sesión. A quien reporta le avisamos que lo revisamos, no qué decidimos sobre otra persona.',
    },
    {
      rule: 'Lo grave no espera a que se repita',
      detail:
        'Una amenaza, violencia o acoso sexual puede llevar a una suspensión sin fecha de fin la primera vez.',
    },
  ];
}

export const RULES_SAFETY =
  'Si estás en peligro, llama primero al 9-1-1. Movo no es un servicio de emergencias. Después, reporta: siempre puedes reportar, bloquear a alguien y salir de una sesión, incluso con la cuenta suspendida.';
