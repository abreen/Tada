/** Allow for subpixel layout when comparing against the sticky offset */
const STUCK_TOLERANCE_PX = 0.5;

export default (window: Window): (() => void) | undefined => {
  const trail = window.document.querySelector<HTMLElement>('nav.breadcrumbs');
  if (!trail) {
    return undefined;
  }

  function update() {
    const stickyTop = parseFloat(window.getComputedStyle(trail!).top);
    const rect = trail!.getBoundingClientRect();
    const isStuck =
      Number.isFinite(stickyTop) &&
      rect.height > 0 &&
      rect.top <= stickyTop + STUCK_TOLERANCE_PX;
    trail!.classList.toggle('is-stuck', isStuck);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();

  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    trail.classList.remove('is-stuck');
  };
};
