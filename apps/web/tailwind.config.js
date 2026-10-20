/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7f6',
          100: '#e4ebe7',
          200: '#cad8d1',
          300: '#a4bdb1',
          400: '#789b8b',
          500: '#587e6e',
          600: '#446457',
          700: '#385147',
          800: '#2f423b',
          900: '#283832',
        },
      },
    },
  },
  plugins: [],
};
