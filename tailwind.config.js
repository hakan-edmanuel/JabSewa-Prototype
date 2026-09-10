/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // #1DCED8 accent + ink/neutral hierarchy (mirrors src/index.css tokens)
        'jabsewa-accent': '#1DCED8',
        'jabsewa-accent-strong': '#14A8B2',
        'jabsewa-accent-text': '#0E7C86',
        'jabsewa-accent-soft': '#E4F7F8',
        'jabsewa-accent-line': '#A9E2E7',
        'jabsewa-ink': '#0B1117',
        'jabsewa-ink-2': '#141C23',
        'jabsewa-text': '#222B31',
        'jabsewa-text-soft': '#5C6B74',
        'jabsewa-surface': '#F4F6F7',
        'jabsewa-bg': '#FAFBFB',
        'jabsewa-border': '#E3E8EB',
      },
      fontFamily: {
        'sans': ['Plus Jakarta Sans', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
