export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  const stored = localStorage.getItem('loveai_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('loveai_theme', t);
}

export function initTheme() {
  setTheme(getTheme());
}
