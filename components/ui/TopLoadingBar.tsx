'use client';
/* A thin, indeterminate progress bar pinned to the very top of the viewport.
 * It subscribes to the API client's global in-flight counter (API.onProgress)
 * and shows whenever ANY request is pending — so every view transition that
 * fetches its data (opening a tool, loading a gallery, saving a run) gets a
 * visible "working…" cue at the top of the page.
 *
 * Behaviour tuned to avoid flicker: it appears immediately when work starts,
 * animates a sliding stripe while active, then fades out on completion. Very
 * fast requests (< ~120ms) never show, so instant pages don't flash a bar. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';

export function TopLoadingBar() {
  // `active` = the API has in-flight work; `visible` = the bar is on screen
  // (kept true briefly after work ends so the fade-out can play).
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = API.onProgress((active) => {
      if (active) {
        // Don't flash for near-instant requests: wait a beat before showing.
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        if (!showTimer.current) {
          showTimer.current = setTimeout(() => { showTimer.current = null; setVisible(true); }, 120);
        }
      } else {
        // Work finished — cancel a pending show, then fade out after a moment so
        // a burst of back-to-back requests reads as one continuous bar.
        if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
        if (!hideTimer.current) {
          hideTimer.current = setTimeout(() => { hideTimer.current = null; setVisible(false); }, 220);
        }
      }
    });
    return () => {
      off();
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 9999,
        pointerEvents: 'none', overflow: 'hidden',
        opacity: visible ? 1 : 0, transition: 'opacity 200ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute', top: 0, height: '100%', width: '40%',
          borderRadius: 3,
          background: 'linear-gradient(90deg, rgba(212,160,23,0) 0%, #d4a017 35%, #e8b93a 65%, rgba(212,160,23,0) 100%)',
          animation: visible ? 'sl-topbar-slide 1.1s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`@keyframes sl-topbar-slide {
        0%   { left: -45%; }
        100% { left: 105%; }
      }`}</style>
    </div>
  );
}
