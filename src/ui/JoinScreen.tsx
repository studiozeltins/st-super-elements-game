import { useState } from 'react';

interface JoinScreenProps {
  isConnected: boolean;
  onJoin(name: string): void;
}

export function JoinScreen({ isConnected, onJoin }: JoinScreenProps) {
  const [name, setName] = useState('');
  const trimmedName = name.trim();

  return (
    <div className="join">
      <div className="join__panel">
        <p className="join__kicker">MONDSTADT · ZAĻAIS REĢIONS</p>
        <h1 className="join__title">
          SUPER<span>ELEMENTS</span>
        </h1>
        <p className="join__subtitle">7 elementi · sinerģijas · PVP + PVE</p>
        <form
          className="join__form"
          onSubmit={event => {
            event.preventDefault();
            if (trimmedName) onJoin(trimmedName);
          }}
        >
          <input
            className="join__input"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Tavs vārds"
            maxLength={16}
            autoFocus
          />
          <button className="join__button" disabled={!isConnected || !trimmedName} type="submit">
            {isConnected ? 'SPĒLĒT' : 'SAVIENOJAS…'}
          </button>
        </form>
      </div>
    </div>
  );
}
