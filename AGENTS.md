# wms-pyme-app

React Native + Expo project (Expo Go / managed workflow). Originally scaffolded as a Figma Make web app (Vite); converted in place to React Native so it runs as a real mobile app via Expo Go. There is no more Vite dev server, no `index.html`, and no DOM — Figma Make's own web preview panel does not apply to this project anymore.

This is the mobile client for the "WMS-PyME" thesis project (`Tesina_WMS_PyME.docx`), a bigger multi-part system (mobile + web portal + Node.js/MongoDB backend). A real backend now lives in `backend/` (see `backend/README.md`) — Login and Selección de almacén call it for real (`src/services/api.ts`, `src/services/auth.ts`, `src/services/warehouses.ts`); every other screen still reads mock data from `src/data.ts`, pending further integration work. Don't assume the whole app is backend-connected just because these two screens are.

Product phases (MVP → field operation → web portal → VPS/multi-company → advanced features) are tracked in `ROADMAP.md`.

## Running the app

There is no dev server auto-started in this environment. To preview the app, run, on a machine with `npm` and network access to the phone:

```bash
npm install
npm start
```

Then scan the QR code with the **Expo Go** app (free, App Store / Play Store) on a phone connected to the same network, or press `a`/`i` in the terminal to launch an Android/iOS emulator if one is configured locally.

## Project Structure

- `index.ts` - Entry point; imports `src/global.css` and calls `registerRootComponent(App)` from `expo`
- `src/App.tsx` - Root component: screen router (manual `useState<Screen>` state machine, no navigation library) and top-level providers (`SafeAreaProvider`, status bar)
- `src/global.css` - Tailwind v3 directives (`@tailwind base/components/utilities`), consumed by NativeWind
- `src/components/ui.tsx` - Shared UI kit (Icon via `react-native-svg`, Button, Input, Card, Badge, Toast, Dialog, SelectField, etc.)
- `src/components/AppShell.tsx` - Chrome shared by most screens: status bar strip, optional header, scrollable content area, bottom tab nav
- `src/screens/*.tsx` - One file per screen, rendered by `src/App.tsx`'s router
- `src/types.ts`, `src/data.ts` - Types and in-memory demo data/business logic (no JSX, platform-agnostic)
- `app.json` - Expo config (name, permissions, plugins)
- `babel.config.js`, `metro.config.js`, `tailwind.config.js` - NativeWind/Expo build wiring — do not add a Vite config back
- `.mise.toml` - Toolchain versions (pnpm listed but not installed in this environment; `npm` was used instead)

## Dependencies

- Runtime: React 19.2, React Native 0.86 (Expo SDK 57), `expo-camera`, `expo-status-bar`, `react-native-safe-area-context`, `react-native-svg`
- Styling: NativeWind v4 (`^4.2.6`) with `tailwindcss` v3. NativeWind's `react-native-css-interop` hard-requires a matching `react-native-reanimated` (and, on the versions paired with reanimated 4.x's new architecture, `react-native-worklets`) to be installed at the version Metro's Babel transform expects — a version mismatch between NativeWind/css-interop and reanimated/worklets breaks bundling with an opaque "Cannot find module 'react-native-reanimated/plugin'" (or `.../worklets/plugin`) error. If you ever bump Expo SDK, NativeWind, or React Native again: after `npx expo install expo@<version>`, run `npx expo install --fix`, then run `npx expo install react-native-reanimated` explicitly (it is a peer dependency npm won't always resolve correctly on its own) and delete/reinstall `node_modules` + the lockfile once everything is pinned, rather than trusting an incremental `npm install`. Verify with `npx expo export --platform ios` (or `android`) — a clean bundle output is the real signal that the dependency graph is consistent; `tsc` alone won't catch this class of error.
- Formatting: oxfmt

## Known simplifications from the web→native conversion

These were accepted to keep the conversion mechanical and unblocked; revisit only if a screen's polish becomes a priority:

- No animation library: `animate-spin` became `ActivityIndicator`; `animate-pulse` (e.g. the "pending sync" dot) just renders statically instead of pulsing.
- `ScanCameraScreen.tsx` was already a fully mocked/simulated camera UI in the original web app (no real `getUserMedia`) and still is — it does not use `expo-camera` for a real camera feed. `expo-camera` is installed and permission-configured in `app.json` for a future real-camera pass, but is currently unused.
- A screen's own internal "sticky footer while the body scrolls" layout (e.g. `MoveConfigScreen`) is nested inside `AppShell`'s single outer `ScrollView`, so the footer scrolls with the content rather than staying pinned — acceptable for this prototype's fidelity level.
- Custom web fonts (IBM Plex Sans / JetBrains Mono, loaded via Google Fonts `@import` in the old `index.css`) were dropped in favor of the platform system font and `Courier` for monospace; no font files are bundled.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings.
- Ensure JSX tags are closed and braces are balanced.
- Export screen/shared components as default exports (screens) or named exports (shared UI kit in `ui.tsx`), matching each file's existing convention.
- Any place that tints an `Icon` (from `src/components/ui.tsx`) needs an explicit `color="#HEX"` prop — React Native's SVG rendering has no `currentColor`/CSS inheritance, unlike the original web version.
