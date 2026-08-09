import React, { useState } from 'react';
import { getTheme, setTheme, Theme } from '../theme';

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        setThemeState(next);
      }}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

export default ThemeToggle;
