export default async function mount(window: Window): Promise<void> {
  const { document } = window;
  if (!document.body.classList.contains('code')) return;

  document.addEventListener('copy', (e: ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const fragment = selection.getRangeAt(0).cloneContents();
    const proseEls = fragment.querySelectorAll('[data-prose-source]');
    if (proseEls.length === 0) return;

    proseEls.forEach(el => {
      const pre = document.createElement('pre');
      pre.textContent = el.getAttribute('data-prose-source');
      el.replaceWith(pre);
    });

    fragment.querySelectorAll('.line-number').forEach(el => el.remove());

    const lines: string[] = [];
    fragment.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (text.trim()) lines.push(text);
      } else if (node instanceof Element) {
        const codeRows = node.querySelectorAll('.code-row');
        if (codeRows.length > 0) {
          codeRows.forEach(row => {
            const codeEl = row.querySelector('code');
            if (codeEl) {
              const text = codeEl.textContent ?? '';
              lines.push(text === '\u00A0' ? '' : text);
            }
          });
        } else {
          lines.push(node.textContent ?? '');
        }
      }
    });

    e.clipboardData!.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  });
}
