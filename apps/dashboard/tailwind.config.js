// eslint-disable-next-line import/extensions, @typescript-eslint/no-var-requires
const defaultThemeColorPreset = require('@dao-style/core/dist/styles/color/preset.js');

module.exports = {
  content: ['./src/**/*.{vue,html,ts,js}'],
  presets: [defaultThemeColorPreset],
  theme: {
    boxShadow: {
      default: '0 4px 8px rgba(var(--dao-pure-black-rgb), 0.1)',
    },
    extend: {},
  },
  plugins: [],
};
