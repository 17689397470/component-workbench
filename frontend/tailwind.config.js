/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        subtle: 'var(--bg-subtle)',
        'border-subtle': 'var(--border-subtle)',
        'border-hover': 'var(--border-hover)',
        'border-focus': 'var(--border-focus)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
        },
        badge: {
          match: {
            bg: 'var(--badge-match-bg)',
            text: 'var(--badge-match-text)',
          },
          sub: {
            bg: 'var(--badge-sub-bg)',
            text: 'var(--badge-sub-text)',
          },
          short: {
            bg: 'var(--badge-short-bg)',
            text: 'var(--badge-short-text)',
          },
          lack: {
            bg: 'var(--badge-lack-bg)',
            text: 'var(--badge-lack-text)',
          },
        },
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Consolas', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
