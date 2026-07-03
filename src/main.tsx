import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
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
