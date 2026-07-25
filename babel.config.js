module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inlines Drizzle's generated .sql migration files as strings (paired with
    // the `sql` sourceExt in metro.config.js).
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
