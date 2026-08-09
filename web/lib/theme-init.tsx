'use client';

import { useEffect } from 'react';
import { initTheme } from './theme';

export default function ThemeInit() {
  useEffect(() => {
    initTheme();
  }, []);
  return null;
}
