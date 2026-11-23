import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType, NavigationType } from 'react-router-dom';

/**
 * ScrollManager: Centralized, Route-Aware Scroll Restoration Architecture
 *
 * Guarantees:
 * 1. New Route Navigation (PUSH/REPLACE to distinct pathname): Resets vertical & horizontal scroll to (0, 0) instantly.
 * 2. Hash Anchors (#section): Scrolls smoothly to matching element once mounted.
 * 3. Browser Back/Forward (POP): Restores previously recorded scroll position.
 * 4. Same-Route Query/Filter changes (pathname identical): Preserves active scroll position without jump.
 * 5. Multi-Container Resets: Synchronizes window, document.documentElement, document.body, and main containers.
 * 6. React.lazy() / Suspense Shield: Double-frame verification ensures positions don't drift as async chunks mount.
 */

// In-memory cache for fast lookup during session navigation
const positionCache = new Map<string, { x: number; y: number }>();
const STORAGE_KEY = '__pi_scroll_positions__';

function loadStoredPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePosition(key: string, x: number, y: number) {
  if (!key) return;
  positionCache.set(key, { x, y });
  try {
    const stored = loadStoredPositions();
    stored[key] = { x, y };
    const keys = Object.keys(stored);
    if (keys.length > 50) {
      delete stored[keys[0]];
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // sessionStorage may be blocked or unavailable in some browser modes
  }
}

function getSavedPosition(key: string): { x: number; y: number } | undefined {
  if (positionCache.has(key)) {
    return positionCache.get(key);
  }
  const stored = loadStoredPositions();
  if (stored[key]) {
    positionCache.set(key, stored[key]);
    return stored[key];
  }
  return undefined;
}

export const ScrollManager: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  const prevPathnameRef = useRef<string>(location.pathname);
  const prevKeyRef = useRef<string>(location.key);
  const isInitialMount = useRef<boolean>(true);

  // 1. Authoritative control over browser native scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      const original = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      return () => {
        window.history.scrollRestoration = original;
      };
    }
  }, []);

  // 2. Continuously record current scroll position for active route key
  useEffect(() => {
    let scrollTimeout: number | undefined;

    const handleScroll = () => {
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(() => {
        const x = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
        const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        savePosition(location.key, x, y);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      const x = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
      const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      savePosition(location.key, x, y);
    };
  }, [location.key]);

  // 3. Centralized Scroll Restoration on Navigation
  useLayoutEffect(() => {
    // Save last known position of the leaving route
    const currentX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
    const currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    savePosition(prevKeyRef.current, currentX, currentY);

    const isNewPathname = location.pathname !== prevPathnameRef.current;
    const isPop = navigationType === NavigationType.Pop;
    const hasHash = Boolean(location.hash);

    const resetTo = (targetY: number, targetX: number = 0) => {
      // Primary Window & HTML Document
      window.scrollTo({ left: targetX, top: targetY, behavior: 'instant' });
      if (document.documentElement) {
        document.documentElement.scrollTop = targetY;
        document.documentElement.scrollLeft = targetX;
      }
      if (document.body) {
        document.body.scrollTop = targetY;
        document.body.scrollLeft = targetX;
      }

      // Nested layout main containers if scrolled independently
      const scrollableContainers = document.querySelectorAll(
        'main, .admin-scroll, [data-scroll-container]'
      );
      scrollableContainers.forEach((el) => {
        if (targetY === 0 && el.scrollTop !== 0) {
          el.scrollTop = 0;
        }
      });
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
      // On fresh initial load or refresh, start at top unless hash is provided
      if (hasHash) {
        const targetId = location.hash.replace('#', '');
        const el = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'instant' });
        }
      } else {
        resetTo(0, 0);
      }
      prevPathnameRef.current = location.pathname;
      prevKeyRef.current = location.key;
      return;
    }

    if (hasHash) {
      // ── HASH NAVIGATION (e.g. /#how-it-works) ──
      const targetId = location.hash.replace('#', '');
      const scrollTarget = () => {
        const el = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          return true;
        }
        return false;
      };

      if (!scrollTarget()) {
        requestAnimationFrame(() => {
          if (!scrollTarget()) {
            setTimeout(scrollTarget, 100);
          }
        });
      }
    } else if (isPop) {
      // ── BROWSER BACK / FORWARD NAVIGATION (POP) ──
      const saved = getSavedPosition(location.key);
      const targetY = saved ? saved.y : 0;
      const targetX = saved ? saved.x : 0;

      resetTo(targetY, targetX);
      requestAnimationFrame(() => {
        resetTo(targetY, targetX);
      });
    } else if (isNewPathname) {
      // ── NEW ROUTE NAVIGATION (PUSH / REPLACE to a different pathname) ──
      resetTo(0, 0);

      // Re-apply across animation frame to ensure lazy components paint at top
      requestAnimationFrame(() => {
        resetTo(0, 0);
      });
    }
    // When pathname is identical and no hash (query param filter change), position is preserved.

    prevPathnameRef.current = location.pathname;
    prevKeyRef.current = location.key;
  }, [location.pathname, location.search, location.hash, location.key, navigationType]);

  return null;
};
