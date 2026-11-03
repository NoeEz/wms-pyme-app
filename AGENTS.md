# wms-pyme-app

React Native + Expo project (Expo Go / managed workflow). Originally scaffolded as a Figma Make web app (Vite); converted in place to React Native so it runs as a real mobile app via Expo Go. There is no more Vite dev server, no `index.html`, and no DOM — Figma Make's own web preview panel does not apply to this project anymore.

This is the mobile client for the "WMS-PyME" thesis project (`Tesina_WMS_PyME.docx`), a bigger multi-part system (mobile + web portal + Node.js/MongoDB backend). A real backend lives in `backend/` (see `backend/README.md`) and every screen talks to it through `src/services/*` — there is no mock data left in the app (the old `src/data.ts` was removed).

The app is offline-first for operators:

- **Connectivity** (`src/services/connectivity.ts`): "online" means the backend's `/health` answers (NetInfo reachability), not merely that the phone has Wi-Fi.
- **Offline queue** (`src/services/syncQueue.ts`): a movement confirmed without reachable server is persisted in AsyncStorage and replayed automatically (on reconnect, on foreground, every 30 s). Every movement carries a `clientId` (UUID) — the backend is idempotent on it, so retries never apply a movement twice. Business-rule rejections (stock insuficiente, serie duplicada…) are shown as "Rechazado" in Pendientes for the operator to retry or discard.
- **Read cache** (`cachedGet` in `src/services/api.ts`): catalog, inventory, locations and warehouses are cached on each successful GET and served from the device when offline, so scanning and manual capture keep working. Cleared on logout.
- **Session** (`src/services/auth.ts`): token in `expo-secure-store`, user + last warehouse in AsyncStorage; restored on launch (trusted offline, validated with `/auth/me` when reachable). Any 401 sends the user back to login; their queued movements stay and sync after they log back in.
- **Scanning** (`src/services/scanning.ts` + `scanCodes.ts`): one pipeline for camera and handheld readers. Accepts versioned WMS labels (`WMSPYME|v1|sku=…|lot=…|serial=…`) and plain supplier barcodes (matched against `sku`/`barcodeValues`). Sound/vibration feedback honors the preferences in `src/services/preferences.ts`.

Product phases (MVP → field operation → web portal → VPS/multi-company → advanced features) are tracked in `ROADMAP.md`.

## Running the app

There is no dev server auto-started in this environment. To preview the app, run, on a machine with `npm` and network access to the phone:

```bash
npm install
npm start
```

Then scan the QR code with the **Expo Go** app (free, App Store / Play Store) on a phone connected to the same network, or press `a`/`i` in the terminal to launch an Android/iOS emulator if one is configured locally.

`npm start` and the other npm scripts run Expo CLI through `scripts/expo.js`, which gives this project its own Expo session (`~/.expo-wms-pyme`) separate from the machine's global one (`~/.expo`) — so it can use a different Expo account than other projects. Log in once with `npm run expo -- login --no-browser` (asks for username/password in the terminal; works if the account has a password). The default browser flow is `npm run expo -- login`; on Windows, Expo CLI opens the browser with `cmd /c start "" <url>` and cmd splits the OAuth URL at every `&`, so the browser gets a truncated link; the wrapper keeps the CLI alive for `login` so you can copy the full "visit this link" URL from the terminal into the browser yourself (use a private window if the browser is signed in to a different Expo account). If the browser flow doesn't complete, create a personal access token for this project's Expo account at https://expo.dev/settings/access-tokens and save it as the only content of `~/.expo-wms-pyme/token` (outside the repo; it overrides any `EXPO_TOKEN` in your shell, so another account's token never leaks in). Use `npm run expo -- <command>` instead of bare `npx expo <command>` for anything that needs the account (bare `npx expo` uses the global session).

Set `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.50:4000/api`, your computer's LAN IP) so the phone can reach the backend.

Installable builds use EAS (`eas.json`): `npx eas-cli build -p android --profile preview` produces an internal-distribution APK (needs an Expo account; edit the `preview` profile's `EXPO_PUBLIC_API_URL` first).

## Project Structure

- `index.ts` - Entry point; imports `src/global.css` and calls `registerRootComponent(App)` from `expo`
- `src/App.tsx` - Root component: screen router (manual `useState<Screen>` state machine, no navigation library) and top-level providers (`SafeAreaProvider`, status bar)
- `src/global.css` - Tailwind v3 directives (`@tailwind base/components/utilities`), consumed by NativeWind
- `src/components/ui.tsx` - Shared UI kit (Icon via `react-native-svg`, Button, Input, Card, Badge, Toast, Dialog, SelectField, etc.)
- `src/components/AppShell.tsx` - Chrome shared by most screens: status bar strip, optional header, scrollable content area, bottom tab nav
- `src/screens/*.tsx` - One file per screen, rendered by `src/App.tsx`'s router
- `src/services/*.ts` - Backend access, offline queue/cache, session, scanning and preferences (no JSX)
- `src/types.ts` - Shared types
- `assets/sounds/*.wav` - Scan feedback beeps (generated tones, no third-party audio)
- `app.json` - Expo config (name, permissions, plugins)
- `babel.config.js`, `metro.config.js`, `tailwind.config.js` - NativeWind/Expo build wiring — do not add a Vite config back
- `.mise.toml` - Toolchain versions (pnpm listed but not installed in this environment; `npm` was used instead)

## Dependencies

- Runtime: React 19.3, React Native 0.88 (Expo SDK 58 — Expo Go on iOS only runs the latest SDK, so keep this current), `react-native-reanimated` 4.7 + `react-native-worklets` 0.13 (pinned explicitly), `expo-camera`, `expo-audio`, `expo-haptics`, `expo-crypto`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-status-bar`, `react-native-safe-area-context`, `react-native-svg`. Add native deps with `npx expo install`, never plain `npm install`, so versions match the SDK.
- Styling: NativeWind v4 (`^4.2.6`) with `tailwindcss` v3. NativeWind's `react-native-css-interop` hard-requires a matching `react-native-reanimated` (and, on the versions paired with reanimated 4.x's new architecture, `react-native-worklets`) to be installed at the version Metro's Babel transform expects — a version mismatch between NativeWind/css-interop and reanimated/worklets breaks bundling with an opaque "Cannot find module 'react-native-reanimated/plugin'" (or `.../worklets/plugin`) error. If you ever bump Expo SDK, NativeWind, or React Native again: after `npx expo install expo@<version>`, run `npx expo install --fix`, then run `npx expo install react-native-reanimated` explicitly (it is a peer dependency npm won't always resolve correctly on its own) and delete/reinstall `node_modules` + the lockfile once everything is pinned, rather than trusting an incremental `npm install`. Verify with `npx expo export --platform ios` (or `android`) — a clean bundle output is the real signal that the dependency graph is consistent; `tsc` alone won't catch this class of error.
- Formatting: oxfmt

## Known simplifications from the web→native conversion

These were accepted to keep the conversion mechanical and unblocked; revisit only if a screen's polish becomes a priority:

- No animation library: `animate-spin` became `ActivityIndicator`; `animate-pulse` (e.g. the "pending sync" dot) just renders statically instead of pulsing.
- A screen's own internal "sticky footer while the body scrolls" layout (e.g. `MoveConfigScreen`) is nested inside `AppShell`'s single outer `ScrollView`, so the footer scrolls with the content rather than staying pinned — acceptable for this prototype's fidelity level.
- Custom web fonts (IBM Plex Sans / JetBrains Mono, loaded via Google Fonts `@import` in the old `index.css`) were dropped in favor of the platform system font and `Courier` for monospace; no font files are bundled.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings.
- Ensure JSX tags are closed and braces are balanced.
- Export screen/shared components as default exports (screens) or named exports (shared UI kit in `ui.tsx`), matching each file's existing convention.
- The "Biblioteca de componentes" screen is a dev aid — it's only reachable when `__DEV__` is true.
- Any place that tints an `Icon` (from `src/components/ui.tsx`) needs an explicit `color="#HEX"` prop — React Native's SVG rendering has no `currentColor`/CSS inheritance, unlike the original web version.
