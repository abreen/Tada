function getBackreferenceElements(parent: HTMLElement): HTMLAnchorElement[] {
  return Array.from(parent.querySelectorAll('.footnote-backref'));
}

export default (window: Window) => {
  const backreferenceElements = getBackreferenceElements(window.document.body);
  backreferenceElements.forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
    };
  });

  return () => {};
};
