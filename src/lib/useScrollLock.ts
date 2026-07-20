"use client";

import { useEffect } from "react";

/**
 * Lock background scroll on the <body> while `locked` is true.
 *
 * Saves the current inline overflow + padding-right (so a scrollbar
 * disappearing doesn't cause a layout shift), sets `overflow: hidden`
 * and a compensating `paddingRight` matching the scrollbar width, then
 * restores the original values on cleanup.
 *
 * Safe to call when `locked` is false — the hook is a no-op.
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body;
    if (!body) return;

    // Only lock if the page is actually scrollable — otherwise the
    // padding compensation is unnecessary and can cause a 0px jump.
    const canScroll = body.scrollHeight > body.clientHeight;

    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    if (canScroll) {
      const scrollbarWidth = window.innerWidth - body.clientWidth;
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [locked]);
}