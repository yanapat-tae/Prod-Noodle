import { useEffect, useRef } from 'react';
export function StickyAction({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const node = ref.current!; const update = () => document.documentElement.style.setProperty('--bottom-bar-height', node.getBoundingClientRect().height + 'px'); const observer = new ResizeObserver(update); observer.observe(node); update(); return () => observer.disconnect(); }, []);
  return <footer ref={ref} className="sticky-cart">{children}</footer>;
}
