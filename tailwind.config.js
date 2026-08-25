/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        'jabsewa-dark-blue': '#1a3a52',
        'jabsewa-blue': '#2c5aa0',
        'jabsewa-light-blue': '#4a7ba7',
        'jabsewa-accent': '#1a1a1a',
      },
      fontFamily: {
        'sans': ['Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
