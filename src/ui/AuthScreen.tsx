import { useState } from 'react';

interface AuthScreenProps {
  isConnected: boolean;
  busy: boolean;
  error: string | null;
  onRegister(username: string, email: string, password: string): void;
  onLogin(username: string, password: string): void;
  onClearError(): void;
}

type Mode = 'login' | 'register';

// "Remember me" stores the login locally so it pre-fills next time. It's XOR+base64
// obfuscated (NOT real encryption — a client can't hide a key from itself; this only
// keeps it out of plaintext). The browser's own password manager (autofill) is the
// more secure path and still works alongside this.
const REMEMBER_KEY = 'auth.remember.v1';
const OBFUSCATE_KEY = 'super-elements-remember-v1';

function xorCipher(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ OBFUSCATE_KEY.charCodeAt(i % OBFUSCATE_KEY.length));
  }
  return out;
}

function packRemember(username: string, password: string): string {
  return btoa(unescape(encodeURIComponent(xorCipher(JSON.stringify({ username, password })))));
}

function readRemember(): { username: string; password: string } | null {
  const raw = localStorage.getItem(REMEMBER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(xorCipher(decodeURIComponent(escape(atob(raw)))));
    if (typeof parsed?.username === 'string' && typeof parsed?.password === 'string') return parsed;
  } catch {
    // Corrupt/legacy value — ignore and start fresh.
  }
  return null;
}

export function AuthScreen({ isConnected, busy, error, onRegister, onLogin, onClearError }: AuthScreenProps) {
  const remembered = readRemember();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState(remembered?.username ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(remembered?.password ?? '');
  const [rememberMe, setRememberMe] = useState(Boolean(remembered));

  const trimmedUsername = username.trim();
  const canSubmit =
    isConnected &&
    !busy &&
    trimmedUsername.length >= 3 &&
    password.length >= 6 &&
    (mode === 'login' || email.trim().length > 0);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    onClearError();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    // Persist (or clear) the remembered login for next time.
    if (rememberMe) localStorage.setItem(REMEMBER_KEY, packRemember(trimmedUsername, password));
    else localStorage.removeItem(REMEMBER_KEY);
    if (mode === 'register') onRegister(trimmedUsername, email.trim(), password);
    else onLogin(trimmedUsername, password);
  };

  return (
    <div className="join">
      <div className="join__panel auth__panel">
        <p className="join__kicker">MONDSTADT · ZAĻAIS REĢIONS</p>
        <h1 className="join__title">
          SUPER<span>ELEMENTS</span>
        </h1>
        <p className="join__subtitle">Konts strādā visās ierīcēs</p>

        <div className="auth__tabs">
          <button
            type="button"
            className={`auth__tab${mode === 'login' ? ' auth__tab--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            IENĀKT
          </button>
          <button
            type="button"
            className={`auth__tab${mode === 'register' ? ' auth__tab--active' : ''}`}
            onClick={() => switchMode('register')}
          >
            REĢISTRĒTIES
          </button>
        </div>

        <form className="auth__form" onSubmit={submit}>
          <input
            id="auth-username"
            name="username"
            className="join__input auth__input"
            value={username}
            onChange={event => setUsername(event.target.value)}
            placeholder="Lietotājvārds"
            autoComplete="username"
            maxLength={16}
            autoFocus
          />
          {mode === 'register' && (
            <input
              id="auth-email"
              name="email"
              className="join__input auth__input"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="E-pasts"
              type="email"
              autoComplete="email"
            />
          )}
          <input
            id="auth-password"
            name="password"
            className="join__input auth__input"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Parole"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

          {mode === 'login' && (
            <label className="auth__remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={event => setRememberMe(event.target.checked)}
              />
              <span>Atcerēties mani</span>
            </label>
          )}

          {error && <p className="auth__error">{error}</p>}

          <button className="join__button auth__button" disabled={!canSubmit} type="submit">
            {!isConnected
              ? 'SAVIENOJAS…'
              : busy
                ? 'LĀDĒJAS…'
                : mode === 'register'
                  ? 'IZVEIDOT KONTU'
                  : 'IENĀKT'}
          </button>
        </form>

        <p className="auth__hint">
          {mode === 'login'
            ? 'Nav konta? Reģistrējies — dati saglabāsies starp ierīcēm.'
            : 'Paroli aizmirsi? Atjaunošana ar e-pastu būs vēlāk.'}
        </p>
      </div>
    </div>
  );
}
