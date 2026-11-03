// Runs Expo CLI with a session of its own for this project, so it can be
// logged in to a different Expo account than the machine's global one
// (~/.expo) without logging the other projects out.
//
//   npm run expo -- login      # once: log in with this project's account
//   npm run expo -- whoami
//   npm start                  # same as `expo start`, with this session
//
// Expo CLI reads __UNSAFE_EXPO_HOME_DIRECTORY only from the real process
// environment (never from .env), hence this wrapper instead of a .env entry.
// The session lives outside the repo, so it can never be committed.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXPO_HOME = process.env.WMS_EXPO_HOME ?? path.join(os.homedir(), ".expo-wms-pyme");

// Browser-free alternative to `login`: put a personal access token for this
// project's Expo account (https://expo.dev/settings/access-tokens) in
// <EXPO_HOME>/token. It takes precedence over any EXPO_TOKEN in your shell, so
// a token for another account set globally never leaks into this project.
function readProjectToken() {
  try {
    return fs.readFileSync(path.join(EXPO_HOME, "token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

// Run the project's own Expo CLI with this same Node binary — no shell, so
// arguments pass through untouched on Windows too.
const expoCli = require.resolve("expo/bin/cli");

const args = process.argv.slice(2);
const nodeArgs = [];

// Windows: Expo CLI opens the login page with `cmd /c start "" <url>`, and cmd
// treats every `&` in the OAuth URL as a command separator. The browser gets a
// truncated URL and the CLI would crash before receiving the login callback.
// For `login` only, don't let that failed browser launch kill the process: it
// prints the full link, which you open yourself (see AGENTS.md).
if (args[0] === "login") {
  nodeArgs.push("--unhandled-rejections=warn");
  if (process.platform === "win32" && !args.includes("--no-browser")) {
    console.log(
      "\n[wms-pyme] En Windows el navegador puede abrir un enlace cortado y mostrar un error abajo; es esperado.\n" +
        "[wms-pyme] Copia el enlace completo de 'visit this link' en una ventana del navegador con la cuenta correcta.\n",
    );
  }
}

const env = { ...process.env, __UNSAFE_EXPO_HOME_DIRECTORY: EXPO_HOME };
const projectToken = readProjectToken();
if (projectToken) env.EXPO_TOKEN = projectToken;

const child = spawn(process.execPath, [...nodeArgs, expoCli, ...args], {
  stdio: "inherit",
  env,
});

child.on("exit", code => process.exit(code ?? 1));
