const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// web/ is the separate Vite portal with its own node_modules (another React
// copy): keep Metro from crawling it.
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escapeRegExp(path.join(__dirname, "web"))}[\\\\/]`),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
