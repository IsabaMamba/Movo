/**
 * Ayuda, en español (Ayuda v1, 3 November). One file per language; the
 * screen searches it on the phone, with no outside service.
 *
 * Every answer says what Movo does today, in steps when there are steps,
 * and ends in something the person can do inside Movo. Things that are
 * designed but not built yet are said to be on their way, never described
 * as if they existed. Change an answer in the same pull request as the
 * behaviour it describes.
 */

export type HelpTopicId = 'empezar' | 'unirse' | 'organizar' | 'seguridad' | 'privacidad' | 'pagos';

export interface HelpAction {
  label: string;
  href:
    | '/'
    | '/mis-sesiones'
    | '/crear'
    | '/cuenta'
    | '/normas'
    | '/permisos'
    | '/perfil/bloqueos'
    | '/perfil/contrasena'
    | '/perfil/deportes'
    | '/grupos';
}

export interface HelpQuestion {
  /** Stable: it is what «¿Te sirvió?» stores (0047). Never reuse one. */
  id: string;
  topic: HelpTopicId;
  question: string;
  /** One paragraph, or several numbered steps. */
  answer: string[];
  steps?: boolean;
  action?: HelpAction;
}

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  icon: 'people' | 'calendar' | 'clipboard' | 'shield' | 'lock' | 'flag';
}

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'empezar', title: 'Empezar', icon: 'people' },
  { id: 'unirse', title: 'Unirse a sesiones', icon: 'calendar' },
  { id: 'organizar', title: 'Organizar', icon: 'clipboard' },
  { id: 'seguridad', title: 'Seguridad y reportes', icon: 'shield' },
  { id: 'privacidad', title: 'Privacidad y tu cuenta', icon: 'lock' },
  { id: 'pagos', title: 'Pagos', icon: 'flag' },
];

/** «Lo más buscado» on the first screen. */
export const HELP_POPULAR = ['marcar-llegue', 'invitar'];

export const HELP_QUESTIONS: HelpQuestion[] = [
  // ------------------------------------------------------------ Empezar
  {
    id: 'es-gratis',
    topic: 'empezar',
    question: '¿Movo es gratis?',
    answer: [
      'Sí. Usar Movo no cuesta nada: buscar sesiones, unirte, organizar y estar en grupos.',
      'Algunas sesiones tienen un costo que pone quien organiza, por ejemplo la cancha o el equipo. Ese precio aparece antes de unirte.',
    ],
    action: { label: 'Ver sesiones cerca', href: '/' },
  },
  {
    id: 'edad',
    topic: 'empezar',
    question: '¿Desde qué edad?',
    answer: [
      'Desde los 18 años. Te pedimos tu fecha de nacimiento al crear la cuenta y no se puede crear si eres menor.',
    ],
  },
  {
    id: 'deportes',
    topic: 'empezar',
    question: '¿Qué deportes hay?',
    answer: [
      '19, en seis familias: correr (running, trail running), montaña (senderismo), balón (fútbol, voleibol, baloncesto, ultimate frisbee, touch rugby, sóftbol, béisbol), ruedas (ciclismo, ciclismo de montaña), entrenar (yoga, bootcamp, calistenia, zumba y baile) y agua (surf, kayak, rafting).',
      'Elige los tuyos y tu nivel en cada uno desde tu perfil: así aparecen primero.',
    ],
    action: { label: 'Elegir mis deportes', href: '/perfil/deportes' },
  },
  {
    id: 'ubicacion',
    topic: 'empezar',
    question: '¿Por qué me pide la ubicación?',
    answer: [
      'Para mostrarte las sesiones que tienes cerca. Es aproximada y solo mientras usas Movo.',
      'No hace falta: en Descubrir puedes elegir un punto de partida y un radio en vez de usar tu ubicación. De tu zona solo se guarda el distrito, si lo pones en tu perfil, y nadie más lo ve.',
    ],
    action: { label: 'Ver tus permisos', href: '/permisos' },
  },

  // -------------------------------------------------- Unirse a sesiones
  {
    id: 'unirme',
    topic: 'unirse',
    question: '¿Cómo me uno?',
    answer: [
      'Abre una sesión en Descubrir.',
      'Revisa la hora, el lugar, el nivel y si tiene costo.',
      'Toca «Unirme». Si está llena, entras a la lista de espera.',
      'La sesión aparece en Mis sesiones, con cómo llegar.',
    ],
    steps: true,
    action: { label: 'Ir a Descubrir', href: '/' },
  },
  {
    id: 'serie',
    topic: 'unirse',
    question: '¿Qué es una serie?',
    answer: [
      'Una sesión que se repite, por ejemplo cada martes a las 6:00. En Descubrir aparece una sola vez, con cuántas fechas quedan.',
      'Por ahora te unes fecha por fecha: abre la serie y elige las fechas a las que vas.',
    ],
  },
  {
    id: 'marcar-llegue',
    topic: 'unirse',
    question: '¿Cómo marco «Llegué»?',
    answer: [
      'Abre Mis sesiones. Desde 15 minutos antes hasta 45 minutos después del inicio, tu próxima sesión muestra «Llegué».',
      'Tócalo y escribe el código de 4 números que tiene quien organiza.',
      'Si no hay señal, Movo guarda la hora en que tocaste y la envía cuando vuelva; quien organiza la confirma.',
    ],
    steps: true,
    action: { label: 'Ir a Mis sesiones', href: '/mis-sesiones' },
  },
  {
    id: 'no-puedo-ir',
    topic: 'unirse',
    question: '¿Qué pasa si no puedo ir?',
    answer: [
      'Sal de la sesión en cuanto lo sepas: en Mis sesiones, «No puedo ir». Tu lugar pasa a la primera persona en lista de espera, y le avisamos.',
      'Salir no tiene castigo. Lo que pide la comunidad es avisar.',
    ],
    action: { label: 'Ir a Mis sesiones', href: '/mis-sesiones' },
  },
  {
    id: 'lista-espera',
    topic: 'unirse',
    question: '¿Qué es la lista de espera?',
    answer: [
      'Cuando una sesión está llena, puedes quedar en la lista de espera. Si alguien sale, el primer lugar es tuyo y te llega un aviso: ya vas, sin hacer nada más.',
    ],
  },
  {
    id: 'invitar',
    topic: 'unirse',
    question: '¿Cómo invito a alguien que no tiene Movo?',
    answer: [
      'En Mis sesiones, tu próxima sesión tiene «Invitar a alguien»: compártelo por donde quieras. La otra persona la encuentra en Movo.',
      'Para un grupo con invitación, quien lo organiza crea un enlace en Ajustes del grupo; sirve 7 días.',
    ],
    action: { label: 'Ir a Mis sesiones', href: '/mis-sesiones' },
  },

  // ---------------------------------------------------------- Organizar
  {
    id: 'quien-organiza',
    topic: 'organizar',
    question: '¿Quién puede organizar?',
    answer: [
      'Cualquier persona con cuenta. Organizar es poner hora, lugar público, nivel y cupo, y estar ahí.',
      'Las sesiones van en lugares públicos: parques, canchas, senderos. Nunca una casa o un punto privado.',
    ],
    action: { label: 'Crear una sesión', href: '/crear' },
  },
  {
    id: 'crear-serie',
    topic: 'organizar',
    question: '¿Cómo creo una serie?',
    answer: [
      'En Crear, completa la sesión como siempre.',
      'Activa «Se repite cada semana».',
      'Publica: Movo crea las próximas fechas, cada una con su lista.',
      'Para cambiar la serie entera, ábrela en Organizar.',
    ],
    steps: true,
    action: { label: 'Crear una sesión', href: '/crear' },
  },
  {
    id: 'verificar-identidad',
    topic: 'organizar',
    question: '¿Por qué me piden verificar mi identidad?',
    answer: [
      'Para organizar lo que es solo para mujeres hará falta tener la identidad verificada. Todavía no está disponible: te avisaremos cuando lo esté.',
    ],
  },
  {
    id: 'cerrar-asistencia',
    topic: 'organizar',
    question: '¿Cómo cierro la asistencia?',
    answer: [
      'Abre la sesión desde Organizar.',
      'Muestra el código del día para que cada persona marque «Llegué», o márcala tú.',
      'Al terminar, toca «Cerrar sesión y registrar asistencia». Quien no llegó queda como «No llegó».',
    ],
    steps: true,
  },
  {
    id: 'cobrar',
    topic: 'organizar',
    question: '¿Puedo cobrar?',
    answer: [
      'Puedes poner un precio para cubrir costos, como la cancha o el equipo. Se paga directo a ti, fuera de Movo: Movo no cobra ni guarda dinero.',
      'Di en la descripción cómo se paga y qué incluye.',
    ],
  },
  {
    id: 'cancelar',
    topic: 'organizar',
    question: '¿Cómo cancelo?',
    answer: [
      'Abre la sesión desde Organizar y toca «Cancelar esta sesión». Escribe el motivo: lo ven quienes iban, y a cada persona le llega un aviso.',
      'En surf, kayak y rafting, si la CNE declara alerta para la zona, elige «Alerta de la CNE».',
    ],
  },
  {
    id: 'lugar-verificado',
    topic: 'organizar',
    question: '¿Qué es un lugar verificado?',
    answer: [
      'Un lugar público que el equipo de Movo revisó: que existe, que es público y que está donde dice el mapa. Los lugares nuevos se pueden usar desde el primer día y aparecen como verificados cuando el equipo los revisa.',
    ],
  },

  // ---------------------------------------------- Seguridad y reportes
  {
    id: 'reportar',
    topic: 'seguridad',
    question: '¿Cómo reporto a alguien?',
    answer: [
      'Abre la sesión donde pasó y toca «Reportar esta sesión». Elige el motivo y, si quieres, cuenta qué pasó.',
      'Lo lee el equipo de Movo. Nadie más.',
    ],
  },
  {
    id: 'que-pasa-reporte',
    topic: 'seguridad',
    question: '¿Qué pasa cuando reporto?',
    answer: [
      'Una persona del equipo de Movo lo lee. Nadie más lo ve.',
      'La persona reportada no sabe quién la reportó.',
      'Si rompió las normas, el equipo puede cancelar la sesión o suspender la cuenta.',
      'Te llega un aviso cuando se decidió. No te contamos qué le pasó a la otra persona.',
    ],
    steps: true,
    action: { label: 'Leer las normas', href: '/normas' },
  },
  {
    id: 'bloquear',
    topic: 'seguridad',
    question: '¿Cómo bloqueo a alguien?',
    answer: [
      'En un chat, mantén presionado un mensaje de esa persona y toca «Bloquear».',
      'Dejan de verse en Descubrir, listas y chats. No le avisamos.',
      'Si va a una sesión a la que vas, te decimos que alguien que bloqueaste va, sin decir quién.',
      'Para desbloquear: Perfil › Bloqueos.',
    ],
    steps: true,
    action: { label: 'Ver mis bloqueos', href: '/perfil/bloqueos' },
  },
  {
    id: 'solo-mujeres',
    topic: 'seguridad',
    question: '¿Qué son las sesiones solo para mujeres?',
    answer: [
      'Sesiones y grupos donde solo entran mujeres. Por eso te preguntamos tu género al registrarte: lo ves solo tú y sirve solo para eso.',
      'Todavía no están disponibles. Te avisaremos cuando lo estén.',
    ],
  },
  {
    id: 'que-revisa',
    topic: 'seguridad',
    question: '¿Qué revisa Movo y qué no?',
    answer: [
      'El equipo revisa los reportes, verifica los lugares públicos y puede cancelar sesiones o suspender cuentas que rompen las normas.',
      'No revisamos a cada persona antes de que vaya a una sesión. Ve a lugares públicos, avisa a alguien de confianza y reporta lo que no esté bien.',
    ],
    action: { label: 'Leer las normas', href: '/normas' },
  },
  {
    id: 'fuera-de-movo',
    topic: 'seguridad',
    question: '¿Y si alguien me escribe fuera de Movo?',
    answer: [
      'Si te incomoda, no tienes que responder. Bloquéala en Movo y reporta la sesión donde se conocieron: el equipo lo revisa aunque haya pasado fuera.',
      'Si estás en peligro, llama al 9-1-1.',
    ],
    action: { label: 'Ver mis bloqueos', href: '/perfil/bloqueos' },
  },

  // -------------------------------------------- Privacidad y tu cuenta
  {
    id: 'perfil-publico',
    topic: 'privacidad',
    question: '¿Quién ve mi perfil?',
    answer: [
      'Quienes van a tus sesiones y están en tus grupos ven tu nombre, tus deportes con tu nivel, lo que escribiste sobre ti y desde cuándo estás en Movo.',
      'Nadie ve tu zona, tu género, tu fecha de nacimiento, tu correo ni a qué sesiones vas.',
    ],
    action: { label: 'Ir a mi perfil', href: '/cuenta' },
  },
  {
    id: 'genero-zona',
    topic: 'privacidad',
    question: '¿Quién ve mi género y mi zona?',
    answer: [
      'Solo tú. El género sirve solo para mostrarte lo que es solo para mujeres. De tu zona se guarda solo el distrito, nunca tu dirección ni coordenadas.',
    ],
  },
  {
    id: 'descargar-datos',
    topic: 'privacidad',
    question: '¿Cómo descargo mis datos?',
    answer: [
      'Perfil › Tus datos › «Descargar mis datos». Te llega un archivo con todo lo que Movo guarda de ti. De otras personas solo aparece un identificador, nunca su nombre.',
    ],
    action: { label: 'Ir a mi perfil', href: '/cuenta' },
  },
  {
    id: 'borrar-cuenta',
    topic: 'privacidad',
    question: '¿Cómo borro mi cuenta?',
    answer: [
      'Perfil › Tus datos › «Borrar mi cuenta». Escribes «borrar» para confirmar y se borra todo lo tuyo: perfil, sesiones, historial y avisos.',
      'Si organizas sesiones que vienen, se cancelan y avisamos a quienes iban. Si creaste un grupo, queda a cargo de otra persona del grupo.',
    ],
    action: { label: 'Ir a mi perfil', href: '/cuenta' },
  },
  {
    id: 'contrasena',
    topic: 'privacidad',
    question: '¿Cómo cambio mi contraseña?',
    answer: [
      'Perfil › Tu cuenta › Contraseña. Escribes la actual y la nueva, de 8 caracteres o más. Puedes cerrar la sesión en tus otros teléfonos al mismo tiempo.',
      'Si entras con Google o Apple, no tienes contraseña en Movo.',
    ],
    action: { label: 'Cambiar mi contraseña', href: '/perfil/contrasena' },
  },

  // -------------------------------------------------------------- Pagos
  {
    id: 'como-pago',
    topic: 'pagos',
    question: '¿Cómo pago una sesión con costo?',
    answer: [
      'Hoy se paga directo a quien organiza, como diga la sesión: en efectivo, SINPE u otro medio. Movo no recibe ese pago.',
    ],
  },
  {
    id: 'devolucion',
    topic: 'pagos',
    question: '¿Movo me devuelve el dinero?',
    answer: [
      'No, porque Movo no recibe el pago. Si una sesión se cancela, habla con quien la organiza; si no responde o no cumple, repórtalo.',
    ],
  },
  {
    id: 'movo-cobra',
    topic: 'pagos',
    question: '¿Movo cobra algo?',
    answer: [
      'No. Movo no cobra a quien va ni a quien organiza. Si eso cambia, va a estar en los términos antes de que pase.',
    ],
  },
];
