// Unit tests for the pure logic layer (money math, invoice numbering, display
// formatting, ledger derivation). These run in plain Node — no Metro, no native
// modules — which is why the transform below uses a self-contained Babel config
// instead of babel.config.js (that one is babel-preset-expo, for the app bundle).
//
// Screens are not covered here: rendering them would pull in expo-sqlite and the
// native voice/print modules. The rules that can actually corrupt a shop's books
// all live in the files under test, and they are pure functions by design.
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // server/ has its own tests, run against Postgres with `npm test` inside it.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/', '/server/'],
  // @noble/* ship as ES modules only, so they have to go through Babel like the
  // rest of the source rather than being skipped as node_modules normally are.
  transformIgnorePatterns: ['node_modules/(?!@noble/)'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
};
