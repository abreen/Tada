import { getElement } from '../util';

export default (window: Window) => {
  const header: HTMLElement = getElement(window.document, 'header');
  const details = getElement(header, 'details') as HTMLDetailsElement;
  const summary = getElement(details, 'summary') as HTMLElement;

  function close() {
    details.open = false;
  }

  function handleDetailsClick(e: MouseEvent) {
    if (details.open) {
      e.stopPropagation();
    }
  }
  details.addEventListener('click', handleDetailsClick);

  function handleWindowClick() {
    if (details.open) {
      close();
    }
  }
  window.addEventListener('click', handleWindowClick);

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (
      e.key === 'Escape' &&
      details.open &&
      details.contains(document.activeElement)
    ) {
      close();
      summary.focus();
    }
  }
  window.addEventListener('keydown', handleWindowKeyDown);

  return () => {
    window.removeEventListener('keydown', handleWindowKeyDown);
    window.removeEventListener('click', handleWindowClick);
    details.removeEventListener('click', handleDetailsClick);
  };
};
