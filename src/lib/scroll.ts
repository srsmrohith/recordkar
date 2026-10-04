/** A saved scroll position that is still reachable after content shrank (e.g. Queue cards were posted). */
export function clampScroll(saved: number, documentHeight: number, viewportHeight: number): number {
  return Math.max(0, Math.min(saved, Math.max(0, documentHeight - viewportHeight)));
}

/**
 * Remember the window's scroll position now and restore it after the next refresh settles. Server
 * actions that revalidate the page can reset the scroll to the top; restoring over a few frames
 * covers that reset whichever frame it lands in.
 */
export function preserveScrollAcrossRefresh(): () => void {
  const saved = window.scrollY;
  return () => {
    let frames = 0;
    const restore = () => {
      const el = document.documentElement;
      window.scrollTo(0, clampScroll(saved, el.scrollHeight, window.innerHeight));
      if (++frames < 10) requestAnimationFrame(restore);
    };
    requestAnimationFrame(restore);
  };
}
