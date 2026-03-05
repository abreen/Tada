export default (window: Window) => {
  function getDetailsElements(parent: HTMLElement): HTMLDetailsElement[] {
    return Array.from(parent.querySelectorAll('details')).filter(
      el => el?.parentElement?.tagName?.toLowerCase() !== 'header',
    );
  }

  function handleBeforePrint() {
    for (const el of getDetailsElements(window.document.body)) {
      if (el.getAttribute('open') == null) {
        el.setAttribute('data-was-closed', 'true');
      }
      el.setAttribute('open', '');
    }
  }
  window.addEventListener('beforeprint', handleBeforePrint);

  function handleAfterPrint() {
    for (const el of getDetailsElements(window.document.body)) {
      if (el.getAttribute('data-was-closed') != null) {
        el.removeAttribute('data-was-closed');
        el.removeAttribute('open');
      }
    }
  }
  window.addEventListener('afterprint', handleAfterPrint);

  return () => {
    window.removeEventListener('afterprint', handleAfterPrint);
    window.removeEventListener('beforeprint', handleBeforePrint);
  };
};
