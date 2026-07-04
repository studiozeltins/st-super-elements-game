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

export function AuthScreen({ isConnected, busy, error, onRegister, onLogin, onClearError }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
              className="join__input auth__input"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="E-pasts"
              type="email"
              autoComplete="email"
            />
          )}
          <input
            className="join__input auth__input"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Parole"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

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
