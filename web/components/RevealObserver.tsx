'use client';

import { useEffect } from 'react';

export default function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-reveal-ready', '');

    const reveal = (el: Element) => el.classList.add('in-view');
    let observer: IntersectionObserver | null = null;

    const scan = () => {
      if (observer) observer.disconnect();
      const els = Array.from(document.querySelectorAll('[data-reveal]:not(.in-view)'));
      if (!els.length) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              reveal(entry.target);
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
      els.forEach((el) => observer?.observe(el));
    };

    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
  }, []);

  return null;
}
