/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
      },
      colors: {
        senate: {
          gold: '#c9a55a',
          'gold-dim': '#8a7240',
          parchment: '#f3e9d2',
        },
      },
    },
  },
  plugins: [],
};
