'use client';
import React from 'react';
import { SharePanel } from '@/components/tools/SharePanel';

/* AuthorBar — the platform-provided social header card for a tool/repo page.
 *
 * One reusable container holding the author avatar + name, a metadata line
 * (created · type · visibility), the ❤ like button, and the 🔗 Share / QR panel,
 * plus an optional slot for owner actions (e.g. ⚙️ Settings). Tools never build
 * their own author/like/share chrome — they get this.
 *
 * Responsive: identity (avatar + name + meta) and the action buttons sit on one
 * row on wide screens and stack into two full-width rows on narrow phones (via
 * the .author-bar CSS), so nothing gets crushed the way the old inline flex did. */

// Deterministic emoji+color avatar from a username (matches the feed's style).
const AV_EMOJI = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
const AV_COLOR = ['#f9a03f', '#5c80bc', '#7fb069', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f'];
export function avatarFor(name: string) {
  let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return { emoji: AV_EMOJI[h % AV_EMOJI.length], color: AV_COLOR[(h >> 4) % AV_COLOR.length] };
}

export function AuthorBar({
  owner, meta, liked, likes, onToggleLike, shareSlug, shareTitle, showShare, actions,
}: {
  owner: string;
  meta: string;
  liked: boolean;
  likes: number;
  onToggleLike: () => void;
  shareSlug: string;
  shareTitle: string;
  showShare: boolean;
  actions?: React.ReactNode;   // optional owner controls (e.g. ⚙️ Settings)
}) {
  const av = avatarFor(owner);
  return (
    <div className="card author-bar" style={{ maxWidth: 820, margin: '0 auto', padding: '12px 16px' }}>
      <div className="author-bar__id">
        <span aria-hidden style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: av.color, border: '2px solid var(--ink)', fontSize: 20 }}>{av.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>@{owner}</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{meta}</div>
        </div>
      </div>
      <div className="author-bar__actions">
        <button className="btn small ghost" onClick={onToggleLike} aria-pressed={liked}>{liked ? '❤️' : '🤍'} {likes}</button>
        {showShare && <SharePanel slug={shareSlug} title={shareTitle} />}
        {actions}
      </div>
    </div>
  );
}
