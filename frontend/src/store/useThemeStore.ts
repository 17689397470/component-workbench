import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme = (localStorage.getItem('bom_theme') as ThemeMode) || 'light';
  document.documentElement.setAttribute('data-theme', initialTheme);

  return {
    theme: initialTheme,
    toggleTheme: () => {
      const next = get().theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('bom_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      set({ theme: next });
    },
    setTheme: (theme) => {
      localStorage.setItem('bom_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      set({ theme });
    },
  };
});
