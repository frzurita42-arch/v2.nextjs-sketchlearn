'use client';
/* A small reusable hook that gives a section header an editable, admin-persisted
 * title (loaded from / saved to a site setting) plus an AI "distortion" reword.
 * Spread the result straight into a Collection or Carousel:
 *   <Collection title=... canEditTitle=... onRenameTitle=... onRemixTitle=... /> */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';

export function useShelfTitle(key: string, fallback: string) {
  const app = useApp();
  // Section titles are admin-only site chrome — gate on the EFFECTIVE admin flag
  // so editing disappears in the Moderators / User previews (and for real
  // moderator / user accounts), not just the raw session role.
  const isAdmin = app.eff().isAdmin;
  const [title, setTitle] = useState(fallback);
  const [remixingTitle, setRemixing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    API.get('/api/site-settings').then((r: any) => {
      const v = r?.settings?.[key];
      if (!cancelled && typeof v === 'string' && v) setTitle(v);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [key]);

  const onRenameTitle = async (t: string) => {
    const v = t.trim(); if (!v) return;
    setTitle(v);
    try { await API.put('/api/site-settings', { key, value: v }); } catch { /* ignore */ }
  };
  const onRemixTitle = async () => {
    setRemixing(true);
    try {
      const r = await API.post('/api/site-settings/remix', { text: title, kind: 'title' });
      if (r?.text) await onRenameTitle(r.text); else if (r?.error) alert(r.error);
    } catch { /* ignore */ } finally { setRemixing(false); }
  };

  return { title, canEditTitle: isAdmin, onRenameTitle, onRemixTitle, remixingTitle };
}
