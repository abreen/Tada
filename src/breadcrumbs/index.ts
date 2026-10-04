/** Allow for subpixel layout when comparing against the sticky offset */
const STUCK_TOLERANCE_PX = 0.5;

/**
 * Mark the trail with `is-stuck` while it is pinned at its sticky offset.
 * Navigation also calls this during the swap, after restoring scroll, so the
 * incoming view transition snapshot already shows the stuck bar.
 */
export function syncBreadcrumbStuckState(window: Window): void {
  const trail = window.document.querySelector<HTMLElement>('nav.breadcrumbs');
  if (!trail) {
    return;
  }
  const stickyTop = parseFloat(window.getComputedStyle(trail).top);
  const rect = trail.getBoundingClientRect();
  const isStuck =
    Number.isFinite(stickyTop) &&
    rect.height > 0 &&
    rect.top <= stickyTop + STUCK_TOLERANCE_PX;
  trail.classList.toggle('is-stuck', isStuck);
}

export default (window: Window): (() => void) | undefined => {
  const trail = window.document.querySelector<HTMLElement>('nav.breadcrumbs');
  if (!trail) {
    return undefined;
  }

  const update = () => syncBreadcrumbStuckState(window);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();

  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    trail.classList.remove('is-stuck');
  };
};
