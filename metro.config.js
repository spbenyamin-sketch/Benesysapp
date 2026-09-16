const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { MODULES: ONLINE_MODULES } = require('./scripts/online-services');

const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated .sql migration files through Metro (expo-sqlite migrator).
config.resolver.sourceExts.push('sql');

// The Postgres server is its own project; nothing in the app bundle comes from it.
// Anchored to this folder: node_modules has its own "server" directories (react-dom/server).
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${escapeRegExp(path.join(__dirname, 'server'))}[\\\\/].*`)];

// Online mode (web only): the shop's books live on the server, so on web every
// import of modules/<name>/service is answered by web/services/<name>.ts, which
// keeps the module's sync helpers and sends each async function over the
// network. The phone bundles are resolved exactly as before. The stub itself
// still reaches the real module, for those sync helpers.
const SERVICE_FILE = /[\\/]modules[\\/](\w+)[\\/]service\.ts$/;
const STUBS = path.join(__dirname, 'web', 'services');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = context.resolveRequest(context, moduleName, platform);
  if (platform !== 'web' || resolved.type !== 'sourceFile') return resolved;
  const match = resolved.filePath.match(SERVICE_FILE);
  if (!match || !ONLINE_MODULES.includes(match[1])) return resolved;
  const stub = path.join(STUBS, `${match[1]}.ts`);
  if (path.resolve(context.originModulePath) === stub) return resolved;
  return { type: 'sourceFile', filePath: stub };
};

module.exports = config;
