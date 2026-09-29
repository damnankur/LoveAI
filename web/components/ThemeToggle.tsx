'use client';

import React, { useEffect, useState } from 'react';
import { getTheme, setTheme, Theme } from '@/lib/theme';

function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    setMounted(true);
    setThemeState(getTheme());
  }, []);

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
      {mounted ? (theme === 'dark' ? '☀' : '☾') : '☾'}
    </button>
  );
}

export default ThemeToggle;
