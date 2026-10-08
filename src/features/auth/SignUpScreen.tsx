import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

// The bounds mirror the profiles check constraint, so the fallback name in
// handle_new_user() never triggers. Mi cuenta uses the same pair.
import { NAME_MAX, NAME_MIN } from '../../lib/account';
import { MIN_AGE, parseBirthdate } from '../../lib/age';
import { color } from '../../theme';

import { useAuth } from './AuthProvider';
import { authStyles as s } from './styles';

export function SignUpScreen() {
  const { session, loading, signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (session) return <Redirect href="/" />;

  if (confirmationSent) {
    return (
      <View style={s.screen}>
        <Text style={s.title}>Revisa tu correo</Text>
        {/* Nothing else marks the transition: the form is replaced in place, so
            this text is the whole outcome of pressing the button. */}
        <Text accessibilityRole="alert" style={s.notice}>
          Te enviamos un enlace de confirmación a {email.trim()}. Ábrelo para activar tu cuenta y
          después inicia sesión.
        </Text>
        <Link href="/sign-in" style={s.link}>
          <Text style={s.linkText}>Volver a iniciar sesión</Text>
        </Link>
      </View>
    );
  }

  const trimmedName = displayName.trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const birth = parseBirthdate(day, month, year);
  const birthTouched = day.length > 0 || month.length > 0 || year.length > 0;
  const canSubmit = nameValid && birth.ok && email.length > 0 && password.length > 0 && !busy;

  const submit = () => {
    if (!canSubmit || !birth.ok) return;
    setError(null);
    setBusy(true);
    signUp(email.trim(), password, trimmedName, birth.iso)
      .then((outcome) => {
        // With email confirmation on, signUp returns no session. Redirecting
        // to the app here would land on a screen that cannot read anything.
        if (outcome === 'confirmation-required') setConfirmationSent(true);
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : '';
        // The database's refusal (0031) reaches the client as Supabase Auth's
        // generic wording. The form checks the same rule first, so this is a
        // date the form let through and the database did not — say which field.
        setError(
          message.includes('Database error saving new user')
            ? 'No se pudo crear la cuenta. Revisa tu fecha de nacimiento.'
            : message || 'No se pudo crear la cuenta.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Crear cuenta</Text>
      <Text style={s.subtitle}>Movo — actividades cerca de ti</Text>

      <Text style={s.label}>Nombre</Text>
      <TextInput
        accessibilityLabel="Nombre"
        /* The length bounds are enforced by silently disabling the button, so
           they have to be said somewhere a screen reader reaches. */
        accessibilityHint={`Entre ${NAME_MIN} y ${NAME_MAX} caracteres.`}
        autoComplete="name"
        maxLength={NAME_MAX}
        onChangeText={setDisplayName}
        placeholder="Cómo te van a ver"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={displayName}
      />

      <Text style={s.label}>Fecha de nacimiento</Text>
      {/* Three plain fields rather than a date picker: a picker opens on
          today and asks for decades of scrolling, and on web it is a
          different control in every browser. */}
      <View style={s.dateRow}>
        <TextInput
          accessibilityLabel="Día de nacimiento"
          autoComplete="birthdate-day"
          inputMode="numeric"
          maxLength={2}
          onChangeText={setDay}
          placeholder="Día"
          placeholderTextColor={color.text.tertiary}
          style={[s.input, s.dateDay]}
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
          style={[s.input, s.dateDay]}
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
          style={[s.input, s.dateYear]}
          value={year}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={birthTouched && !birth.ok ? s.error : s.hint}>
        {birthTouched && !birth.ok
          ? birth.problem
          : `Movo es para personas de ${MIN_AGE} años o más. Solo tú la ves y no se puede cambiar después.`}
      </Text>

      <Text style={s.label}>Correo</Text>
      <TextInput
        accessibilityLabel="Correo"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        onChangeText={setEmail}
        placeholder="tu@ejemplo.cr"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={email}
      />

      <Text style={s.label}>Contraseña</Text>
      <TextInput
        accessibilityLabel="Contraseña"
        /* The minimum only exists in the placeholder, which is gone as soon as
           there is a character in the field. */
        accessibilityHint="Mínimo 6 caracteres."
        autoCapitalize="none"
        autoComplete="new-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="Mínimo 6 caracteres"
        placeholderTextColor={color.text.tertiary}
        secureTextEntry
        style={s.input}
        value={password}
      />

      {/* The only feedback a failed signup has. It appears below the field the
          user just left, so without a role it lands silently. */}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        /* The label tracks the visible text: "Creando…" is how the button
           reports that the request is in flight, and a fixed label would hide
           the only sign that anything happened. */
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Creando…' : 'Crear cuenta'}
        aria-disabled={!canSubmit}
        disabled={!canSubmit}
        onPress={submit}
        style={[s.button, !canSubmit && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Creando…' : 'Crear cuenta'}</Text>
      </Pressable>

      {/* Before the account exists, not after: the rules are what the person
          agrees to meet strangers under. */}
      <Link href="/normas" style={s.link}>
        <Text style={s.linkText}>Al crear tu cuenta aceptas las normas de la comunidad</Text>
      </Link>

      <Link href="/sign-in" style={s.link}>
        <Text style={s.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
      </Link>
    </View>
  );
}
