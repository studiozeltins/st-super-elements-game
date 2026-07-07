import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (bundled by Vite — no external CDN, works offline on LAN).
// Both families ship the latin-ext subset, so Latvian diacritics (ā ē ī ū č ģ ķ ļ
// ņ š ž) render in the same font as the rest of the text.
import '@fontsource-variable/handjet/wght.css';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './index.css';
// Runtime-swappable gameplay-HUD skins (Alfa default + 5 themes). Loads after
// index.css so its `[data-hud-theme] .hud` rules layer over the base HUD.
import './styles/hud/index.css';
import App from './App.tsx';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings/index.ts';
import { MODULE_NAME, SPACETIMEDB_URI } from './config.ts';

const TOKEN_KEY = `${SPACETIMEDB_URI}/${MODULE_NAME}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIMEDB_URI)
  .withDatabaseName(MODULE_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn, _identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);
  })
  .onConnectError((_ctx, error) => {
    console.error('SpacetimeDB connection error:', error);
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
