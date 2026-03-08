import { getElement } from '../util';

export default (window: Window) => {
  const header: HTMLElement = getElement(window.document, 'header');
  const details = getElement(header, 'details') as HTMLDetailsElement;

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

  return () => {
    window.removeEventListener('click', handleWindowClick);
    details.removeEventListener('click', handleDetailsClick);
  };
};
