/**
 * The words of movo.app's landing page (Landing v3, 4 November).
 *
 * Copy from the board, with one rule on top: the page promises only what the
 * app does today. Three things on the board are not built yet and are left
 * out until they are — women-only sessions and groups, identity
 * verification, and search up to 100 km — as are the store buttons, because
 * there is no app in either store. When one of them ships, its line comes
 * back here.
 */

import type { IconName } from '../features/nav/Icon';
import type { SportFamily } from '../types/database';

export const HERO = {
  eyebrow: 'COSTA RICA · PARA MAYORES DE 18',
  title: 'Encuentra con quién',
  highlight: 'moverte',
  body: 'Correr, jugar, pedalear, remar o entrenar cerca de ti, con gente real y en lugares públicos. Ves quién organiza y quiénes van antes de unirte.',
  checks: ['Unirte es gratis', 'Si una sesión cobra algo, lo dice antes'],
} as const;

export const STEPS: readonly { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'pin',
    title: 'Mira dónde se mueve la gente',
    body: 'El mapa muestra cuántas personas van a sesiones cerca de ti esta semana, por zona.',
  },
  {
    icon: 'people',
    title: 'Únete o invita a alguien',
    body: 'Elige una fecha o toda la serie. Si vas por primera vez, invita a tus amigos con un enlace.',
  },
  {
    icon: 'check',
    title: 'Llega y marca «Llegué»',
    body: 'Con el código de 4 números que tiene quien organiza. Así la asistencia es real.',
  },
];

export const FAMILIES: readonly { family: SportFamily; body: string; sports: string[] }[] = [
  {
    family: 'correr',
    body: 'Del 5K suave al trail de montaña. Cada sesión dice distancia y ritmo.',
    sports: ['Running', 'Trail running'],
  },
  {
    family: 'montana',
    body: 'Rutas con desnivel, distancia y punto de encuentro claros.',
    sports: ['Senderismo'],
  },
  {
    family: 'balon',
    body: 'Partidos de 5, de 7 o de playa. Si hay cancha que pagar, se divide.',
    sports: [
      'Fútbol',
      'Voleibol',
      'Baloncesto',
      'Ultimate frisbee',
      'Touch rugby',
      'Sóftbol',
      'Béisbol',
    ],
  },
  {
    family: 'ruedas',
    body: 'Ruta o montaña, con velocidad promedio y casco obligatorio.',
    sports: ['Ciclismo', 'Ciclismo de montaña'],
  },
  {
    family: 'entrenar',
    body: 'En parques y espacios públicos. Traes tu mat y tus ganas.',
    sports: ['Yoga', 'Bootcamp', 'Calistenia', 'Zumba y baile'],
  },
  {
    family: 'agua',
    body: 'Chaleco para todo el mundo y saber nadar. Si hay alerta de la CNE, se cancela.',
    sports: ['Surf', 'Kayak', 'Rafting'],
  },
];

export const SAFETY = {
  eyebrow: 'SEGURIDAD · SOLO MAYORES DE 18',
  title: 'Para llegar aunque no conozcas a nadie',
  body: 'Movo junta a personas que no se conocen. Por eso las reglas están en el diseño, no en letra pequeña.',
  items: [
    {
      icon: 'pin',
      title: 'Solo lugares públicos',
      body: 'Parques, canchas y senderos. Ninguna sesión se hace en una casa.',
    },
    {
      icon: 'eye',
      title: 'Tu zona, nunca tu dirección',
      body: 'El mapa cuenta personas por zona. No muestra dónde vive nadie.',
    },
    {
      icon: 'lock',
      title: 'Tus datos de contacto no se comparten',
      body: 'Nadie ve tu teléfono ni tu correo, tampoco quien organiza.',
    },
    {
      icon: 'flag',
      title: 'Reportar y bloquear, siempre a mano',
      body: 'Desde cualquier perfil o sesión. Cada reporte lo lee alguien del equipo.',
    },
  ] as const satisfies readonly { icon: IconName; title: string; body: string }[],
};

export const ORGANIZE = {
  eyebrow: 'PARA ORGANIZAR',
  title: '¿Organizas algo? Movo te arma la lista',
  checks: [
    'Series semanales: la gente se une a todas las fechas o a una.',
    'La lista se llena sola: cada persona marca «Llegué» con el código del día.',
    'Si quieres, te avisamos una vez al día quién se une o sale.',
  ],
} as const;

export const CLOSING = {
  title: 'Alguien cerca ya va a moverse.',
  highlight: '¿Te animas?',
} as const;
