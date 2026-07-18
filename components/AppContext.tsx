'use client';
import { createContext, useContext } from 'react';
import type { SessionUser } from '@/lib/api';

export type ViewName = 'home' | 'path' | 'settings' | 'activity' | 'language' | 'chat' | 'stats' | 'dashboard' | 'cspath' | 'feed' | 'tools' | 'slides' | 'tool' | 'toolbuilder' | 'toolsettings' | 'moderators' | 'sandbox' | 'empty' | 'presrun' | 'appsettings' | 'users';

// "View as" preview: render the page as a given kind of viewer would see it,
// WITHOUT changing the real session (server-side permission is unaffected).
//   self  — your real identity
//   user  — a plain signed-in viewer (no owner/admin powers)
//   op    — the content's creator (owner powers, but not admin-only ones)
//   admin — an administrator
// 'languages' and 'stem' are placeholder views (shown in the bar, wired up
// later); they fall through to neutral behaviour for now so they change nothing.
export type ViewAs = 'self' | 'user' | 'op' | 'admin' | 'languages' | 'stem';

// The EFFECTIVE identity a component should gate its UI on, given the page's
// content owner. Derived from the real user + the current "view as" selection.
export interface EffPerms {
  role: 'admin' | 'moderator' | 'user';
  username: string;
  isAdmin: boolean;   // admin-only powers (edit the site title/banners/all cards)
  isModerator: boolean; // moderator powers (create content; edit ONLY own content)
  isOwner: boolean;   // owner powers (edit the tool, see all submissions)
  canEdit: boolean;   // isAdmin || isOwner
  preview: boolean;   // true when not viewing as your real self
  viewAs: ViewAs;
}

// Pure derivation so it can be reused/tested. `owner` is the username that owns
// the content on the page (a tool's owner); omit for pages with no single owner.
export function computeEff(user: SessionUser | null, viewAs: ViewAs, owner?: string): EffPerms {
  const realName = user?.username || '';
  const realAdmin = user?.role === 'admin';
  const realMod = user?.role === 'moderator';
  const realOwner = !!owner && realName === owner;
  const mk = (role: 'admin' | 'moderator' | 'user', username: string, isAdmin: boolean, isModerator: boolean, isOwner: boolean, preview: boolean): EffPerms =>
    ({ role, username, isAdmin, isModerator, isOwner, canEdit: isAdmin || isOwner, preview, viewAs });
  switch (viewAs) {
    case 'user':  return mk('user', realName, false, false, false, true);
    // The "Moderators" preview: a content creator with owner powers over this
    // page's content, but no admin (site-chrome) powers.
    case 'op':    return mk('moderator', owner || realName, false, true, true, true);
    case 'admin': return mk('admin', realName, true, false, owner ? realName === owner : false, true);
    case 'self':
    default:      return mk(realAdmin ? 'admin' : realMod ? 'moderator' : 'user', realName, realAdmin, realMod, realOwner, false);
  }
}

export interface AppContextValue {
  view: ViewName;
  nav: (view: ViewName) => void;
  // Re-render the tree after mutating the shared appState singleton in place.
  rerender: () => void;
  tick: number;
  user: SessionUser | null;
  login: (token: string, user: SessionUser) => void;
  logout: () => void;
  // "View as" preview state + the effective-identity helper for a given owner.
  viewAs: ViewAs;
  setViewAs: (v: ViewAs) => void;
  eff: (owner?: string) => EffPerms;
  // Open the sign-in / create-account screen (for guests hitting a gated action).
  requireLogin: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppRoot>');
  return ctx;
}
