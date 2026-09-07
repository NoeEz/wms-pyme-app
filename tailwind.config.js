/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./App.tsx"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // No custom web fonts bundled — closest built-in monospace per platform.
        mono: ["Courier"],
      },
    },
  },
  plugins: [],
};
