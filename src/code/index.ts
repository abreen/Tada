import { globals, type Globals } from '../globals';

type CodeGlobals = Pick<Globals, 'createResizeObserver' | 'fetch'>;

export default async function mount(
  window: Window,
): Promise<void | (() => void)> {
  const { document } = window;
  const runtimeGlobals: CodeGlobals = globals;
  if (!document.body.classList.contains('code')) {
    return;
  }

  document.addEventListener('copy', (e: ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const fragment = selection.getRangeAt(0).cloneContents();
    const proseEls = fragment.querySelectorAll('[data-prose-source]');
    if (proseEls.length === 0) {
      return;
    }

    proseEls.forEach(el => {
      const pre = document.createElement('pre');
      pre.textContent = el.getAttribute('data-prose-source');
      el.replaceWith(pre);
    });

    fragment.querySelectorAll('.line-number').forEach(el => el.remove());

    const lines: string[] = [];
    const container = fragment.querySelector('.code-body');
    const topNodes = container ? container.childNodes : fragment.childNodes;
    topNodes.forEach(node => {
      if (node.nodeType === 3 /* Node.TEXT_NODE */) {
        const text = node.textContent ?? '';
        if (text.trim()) {
          lines.push(text);
        }
      } else if ('querySelectorAll' in node) {
        const el = node as Element;
        const codeRows = el.querySelectorAll('.code-row');
        if (codeRows.length > 0) {
          codeRows.forEach((row: Element) => {
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

  const downloadLink = document.querySelector<HTMLAnchorElement>(
    '.file-header a[download]',
  );
  if (downloadLink && 'showSaveFilePicker' in window) {
    downloadLink.addEventListener('click', async (e: MouseEvent) => {
      e.preventDefault();
      try {
        const handle = await window.showSaveFilePicker!({
          suggestedName: downloadLink.download,
        });
        const response = await runtimeGlobals.fetch(downloadLink.href);
        const writable = await handle.createWritable();
        await writable.write(await response.blob());
        await writable.close();
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          throw err;
        }
      }
    });
  }

  const codeBody = document.querySelector<HTMLElement>('.code-body');
  const scrollbar = document.querySelector<HTMLElement>('.code-scrollbar');
  if (!codeBody || !scrollbar) {
    return;
  }

  const inner = scrollbar.firstElementChild as HTMLElement;
  let syncing = false;

  function updateScrollbar(): void {
    const hasOverflow = codeBody!.scrollWidth > codeBody!.clientWidth;
    scrollbar!.style.display = hasOverflow ? '' : 'none';
    inner.style.width = codeBody!.scrollWidth + 'px';
  }

  codeBody.addEventListener('scroll', () => {
    if (syncing) {
      return;
    }
    syncing = true;
    scrollbar!.scrollLeft = codeBody!.scrollLeft;
    syncing = false;
  });

  scrollbar.addEventListener('scroll', () => {
    if (syncing) {
      return;
    }
    syncing = true;
    codeBody!.scrollLeft = scrollbar!.scrollLeft;
    syncing = false;
  });

  const resizeObserver = runtimeGlobals.createResizeObserver(updateScrollbar);
  resizeObserver.observe(codeBody);
  updateScrollbar();

  return () => {
    resizeObserver.disconnect();
  };
}
