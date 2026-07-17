'use client';
/* DiscussionSection — the ONE container for a page's discussion area: an
 * editable title (✎ edit / 🎨 AI-reword / 👁 hide-from-users, via the shared
 * SectionHeader + useShelfTitle) directly above the reusable CommentSection,
 * closing with a dashed rule. One line drops a full discussion on any page:
 *
 *   <DiscussionSection titleKey="repoDiscussionTitle"
 *     collapseKey="repoDiscussionCollapsed"
 *     targetType="tool" targetId="__gallery_repos__" />
 *
 * The title and the 👁 visibility both persist to site_settings, so the title
 * stays editable from the dashboard's Page-text editor too (same key). When
 * hidden, regular users see nothing; the admin keeps the header (marked
 * "Hidden from other users") so it can be brought back. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useShelfTitle } from '@/components/tools/useShelfTitle';
import { CommentSection } from '@/components/social/CommentSection';

export function DiscussionSection({ titleKey, titleFallback = '💬 Discussion', collapseKey, targetType, targetId, maxWidth = 820 }: {
  titleKey: string;                    // site-settings key for the editable title
  titleFallback?: string;              // default title text
  collapseKey?: string;                // site-settings key for the 👁 hide toggle (omit to always show)
  targetType: 'tool' | 'post';         // what the comments attach to (CommentSection)
  targetId: string;
  maxWidth?: number;
}) {
  const app = useApp();
  const isAdmin = app.eff().isAdmin;
  const hdr = useShelfTitle(titleKey, titleFallback);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    let cancelled = false;
    API.get('/api/site-settings').then((r: any) => { if (!cancelled) setCollapsed(r?.settings?.[collapseKey] === '1'); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [collapseKey]);
  const toggleCollapse = async () => {
    const next = !collapsed;
    setCollapsed(next);
    try { await API.put('/api/site-settings', { key: collapseKey!, value: next ? '1' : '' }); } catch { /* keep optimistic */ }
  };

  if (collapsed && !isAdmin) return null;
  return (
    <div style={{ maxWidth, margin: '18px auto 0' }}>
      <SectionHeader {...hdr} maxWidth={maxWidth}
        showCollapse={!!collapseKey && isAdmin} collapsed={collapsed}
        onToggleCollapse={collapseKey ? toggleCollapse : undefined} />
      {!collapsed && <CommentSection targetType={targetType} targetId={targetId} />}
      <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.45, marginTop: 12 }} />
    </div>
  );
}
