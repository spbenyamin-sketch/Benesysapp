const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated .sql migration files through Metro (expo-sqlite migrator).
config.resolver.sourceExts.push('sql');

module.exports = config;
