/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--cds-surface-0)',
          1: 'var(--cds-surface-1)',
          2: 'var(--cds-surface-2)',
          3: 'var(--cds-surface-3)',
        },
        clay: {
          DEFAULT: 'var(--cds-clay, #d97757)',
          hover: 'var(--cds-clay-hover, #cc5a36)',
          light: 'var(--cds-clay-light, #fbf3ef)',
        },
      },
      borderRadius: {
        xs: '5px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        full: '999px',
      },
      boxShadow: {
        composer: '0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
        'cds-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'cds-md': '0 4px 12px rgba(0, 0, 0, 0.08)',
        popover: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}
