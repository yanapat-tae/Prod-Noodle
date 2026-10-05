import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { activeEntry, selectEntry } from '../preview/api.ts';
import App from './App.tsx';
import './styles/customer-accessibility.css';
import './styles/app.css';
function HtmlPreview() {
  const [, setRevision] = useState(0); const [resetVersion, setResetVersion] = useState(0);
  useEffect(() => {
    const changed = () => { const value = new URLSearchParams(location.hash.slice(1)).get('table'); if (value && value !== activeEntry()) selectEntry(value); setRevision(v => v + 1); };
    const reset = () => { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith('prod-html-cart:') || key?.startsWith('prod-html-session:') || key?.startsWith('prod-html-pos-cart:')) sessionStorage.removeItem(key); } setResetVersion(v => v + 1); changed(); };
    window.addEventListener('hashchange', changed); window.addEventListener('prod-html-context', changed); window.addEventListener('prod-html-reset', reset);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('prod-html-context', changed); window.removeEventListener('prod-html-reset', reset); };
  }, []);
  const route = location.hash.startsWith('#admin') ? 'staff' : 'customer';
  return <App key={route + ':' + activeEntry() + ':' + resetVersion} />;
}
createRoot(document.getElementById('root')!).render(<HtmlPreview />);
