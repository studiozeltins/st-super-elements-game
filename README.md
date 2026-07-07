# SpacetimeDB TypeScript Quickstart Chat

This is a simple chat application that demonstrates how to use SpacetimeDB with TypeScript and React. The chat application is a simple chat room where users can send messages to each other. The chat application uses SpacetimeDB to store the chat messages.

It is based directly on the plain React + TypeScript + Vite template. You can follow the quickstart guide for how creating this project from scratch at [SpacetimeDB TypeScript Quickstart](https://spacetimedb.com/docs/sdks/typescript/quickstart).

You can follow the instructions for creating your own SpacetimeDB module here: [SpacetimeDB Rust Module Quickstart](https://spacetimedb.com/docs/modules/rust/quickstart). Place the module in the `quickstart-chat/server` directory for compability with this project.

In order to run this example, you need to:

- `pnpm build` in the root directory (`spacetimedb-typescriptsdk`)
- `pnpm install` in this directory
- `pnpm build` in this directory
- `pnpm dev` in this directory to run the example

Below is copied from the original template README:

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react';

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
});
```

# Adding a test bot player (local multiplayer testing)

To test the party (Bars) features — invite by tapping a nameplate, roster
frames, kick, disband — you need a second online player. `scripts/party-bot.py`
drives a real second browser client with Playwright: it registers (or logs in
to) an account, comes online as a normal player next to you, and auto-accepts
any party invite it receives. It joins the **same** SpacetimeDB your own client
uses (the page resolves `localhost` → the local STDB), so it shows up in your
world and you can invite it.

**One-time setup:**

```bash
pip install playwright
python -m playwright install chromium
```

**Run it** (dev server up via `pnpm dev`, local SpacetimeDB running):

```bash
# Default: user "PartyBot", online ~10 min, headless
python scripts/party-bot.py

# Custom name / longer session / watch the window
python scripts/party-bot.py --user Bots2 --minutes 15 --headed

# Point at a LAN host instead of localhost
python scripts/party-bot.py --url http://192.168.1.32:5173
```

Then in your own client: tap the bot's floating nameplate → **Uzaicināt savā
barā**. The bot accepts within ~1s and appears in your party frames. Stop the
bot with Ctrl+C.

Flags: `--url` (app URL, default `http://localhost:5173`), `--user`,
`--password`, `--email` (register only), `--minutes` (online duration),
`--headed` (show the browser). Run several bots at once with different
`--user` values to fill a 4-player Bars.

> Note: registering a bot creates a real `account` row in the **local** DB.
> These are not in the backup set — only ever run this against `local`, never
> a DB with real accounts.

### Make a bot follow you (server-driven training dummy)

Headless keyboard movement is unreliable. Instead, mark an online player as a
server-driven **puppet** — the world tick steers it toward the nearest real
player (like an enemy), and `updatePosition` ignores its client so the server
owns its movement:

```bash
# bot online in one terminal:
python scripts/party-bot.py --user PulkaBots

# then, once you are also in-game, make it chase you (local only):
spacetime call 2d-impact-game-fr9ti debug_set_puppet '"PulkaBots"' 'true'  --server local
# stop chasing:
spacetime call 2d-impact-game-fr9ti debug_set_puppet '"PulkaBots"' 'false' --server local
```

`debug_set_puppet(name, enabled)` is a **dev/test** reducer — local use only.
