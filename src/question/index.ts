export default (window: Window) => {
  const bodies =
    window.document.querySelectorAll<HTMLElement>('.question-a-body');
  bodies.forEach(el => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Click to reveal answer');

    const reveal = () => {
      el.setAttribute('data-revealed', '');
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      el.removeAttribute('aria-label');
    };

    el.addEventListener('click', (e: MouseEvent) => {
      if (el.hasAttribute('data-revealed')) {
        return;
      }

      e.stopPropagation();
      reveal();
    });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (el.hasAttribute('data-revealed')) {
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        reveal();
      }
    });
  });
  return () => {};
};
