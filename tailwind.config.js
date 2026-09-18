/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sub: 'rgb(var(--sub) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.25)',
        sheet: '0 -8px 40px -8px rgb(0 0 0 / 0.35)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(12%)', opacity: '0.4' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'flash': {
          '0%': { backgroundColor: 'rgb(var(--flash) / 0.55)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'pop-in': 'pop-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.2, 0.9, 0.2, 1)',
        flash: 'flash 700ms ease-out',
      },
    },
  },
  plugins: [],
}
