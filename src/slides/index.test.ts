import { beforeAll, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

let mount: typeof import('./index').default;

beforeAll(async () => {
  ({ default: mount } = await import('./index'));
});

// JSDOM's DOMWindow is structurally compatible with Window. This alias keeps
// DOM constructors like Event, KeyboardEvent, and MouseEvent available in tests.
type Win = Window & typeof globalThis;

function createWindow(html: string): Win {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'http://localhost/' });
  return dom.window as unknown as Win;
}

function createSlidesWindow(): Win {
  return createWindow(`
    <div class="slides-header">
      <button type="button" data-slides-present>Present</button>
      <label><input id="slides-fullscreen" type="checkbox" data-slides-fullscreen checked> Full screen</label>
    </div>
    <div class="slide-deck" data-slides-root>
      <div class="slide" data-slide-index="0">
        <h1>Slide 1</h1>
        <div class="trace-widget">
          <div class="trace-toolbar">
            <div class="trace-controls">
              <button class="trace-prev" disabled>Prev</button>
              <button class="trace-next">Next</button>
            </div>
          </div>
        </div>
      </div>
      <div class="slide" data-slide-index="1">
        <h1>Slide 2</h1>
      </div>
      <div class="slide" data-slide-index="2">
        <h1>Slide 3</h1>
      </div>
    </div>
  `);
}

function createSlidesWindowWithMultipleTraces(): Win {
  return createWindow(`
    <div class="slides-header">
      <button type="button" data-slides-present>Present</button>
      <label><input id="slides-fullscreen" type="checkbox" data-slides-fullscreen checked> Full screen</label>
    </div>
    <div class="slide-deck" data-slides-root>
      <div class="slide" data-slide-index="0">
        <h1>Slide 1</h1>
        <div class="trace-widget" data-trace-id="first-next">
          <div class="trace-toolbar">
            <div class="trace-controls">
              <button class="trace-prev" disabled>Prev</button>
              <button class="trace-next" disabled>Next</button>
            </div>
          </div>
        </div>
        <div class="trace-widget" data-trace-id="second-next">
          <div class="trace-toolbar">
            <div class="trace-controls">
              <button class="trace-prev" disabled>Prev</button>
              <button class="trace-next">Next</button>
            </div>
          </div>
        </div>
      </div>
      <div class="slide" data-slide-index="1">
        <h1>Slide 2</h1>
        <div class="trace-widget" data-trace-id="first-prev">
          <div class="trace-toolbar">
            <div class="trace-controls">
              <button class="trace-prev" disabled>Prev</button>
              <button class="trace-next" disabled>Next</button>
            </div>
          </div>
        </div>
        <div class="trace-widget" data-trace-id="second-prev">
          <div class="trace-toolbar">
            <div class="trace-controls">
              <button class="trace-prev">Prev</button>
              <button class="trace-next" disabled>Next</button>
            </div>
          </div>
        </div>
      </div>
      <div class="slide" data-slide-index="2">
        <h1>Slide 3</h1>
      </div>
    </div>
  `);
}

function dispatchKey(win: Win, key: string): void {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));
}

function markTraceReady(widget: HTMLElement | null): void {
  if (widget && !widget.querySelector('.trace-line-active')) {
    const doc = widget.ownerDocument;
    const activeLine = doc.createElement('span');
    activeLine.className = 'code-row trace-line-active';
    widget.appendChild(activeLine);
  }

  const diagram = widget?.querySelector('.trace-diagram') as HTMLElement | null;
  if (diagram) {
    diagram.innerHTML = '<svg>ready</svg>';
  }
}

function activeSlideIndex(win: Win): string | null | undefined {
  return win.document
    .querySelector('.slide.is-active')
    ?.getAttribute('data-slide-index');
}

function present(win: Win): void {
  (
    win.document.querySelector('[data-slides-present]') as HTMLButtonElement
  ).click();
}

function setTraceNavigationReady(win: Win): void {
  (win.document.querySelector('.trace-next') as HTMLButtonElement).disabled =
    true;
  (win.document.querySelector('.trace-prev') as HTMLButtonElement).disabled =
    true;
}

describe('slides presentation controller', () => {
  test('mount re-enables Present and Full screen controls that render disabled', () => {
    const win = createSlidesWindow();
    const presentButton = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    presentButton.disabled = true;
    fullscreen.disabled = true;

    const cleanup = mount(win);

    expect(presentButton.disabled).toBe(false);
    expect(fullscreen.disabled).toBe(false);
    expect(fullscreen.checked).toBe(true);

    cleanup?.();
  });

  test('mount keeps Full screen checked when no preference is stored', () => {
    const win = createSlidesWindow();
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    const cleanup = mount(win);

    expect(fullscreen.checked).toBe(true);

    cleanup?.();
  });

  test('mount restores unchecked Full screen preference from localStorage', () => {
    const win = createSlidesWindow();
    win.localStorage.setItem('slidesFullscreen', 'false');
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    const cleanup = mount(win);

    expect(fullscreen.checked).toBe(false);

    cleanup?.();
  });

  test('mount restores checked Full screen preference from localStorage', () => {
    const win = createSlidesWindow();
    win.localStorage.setItem('slidesFullscreen', 'true');
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;
    fullscreen.checked = false;

    const cleanup = mount(win);

    expect(fullscreen.checked).toBe(true);

    cleanup?.();
  });

  test('changing Full screen stores the preference', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    fullscreen.checked = false;
    fullscreen.dispatchEvent(new win.Event('change', { bubbles: true }));
    expect(win.localStorage.getItem('slidesFullscreen')).toBe('false');

    fullscreen.checked = true;
    fullscreen.dispatchEvent(new win.Event('change', { bubbles: true }));
    expect(win.localStorage.getItem('slidesFullscreen')).toBe('true');

    cleanup?.();
  });

  test('blocked Full screen preference storage does not prevent mounting', () => {
    const win = createSlidesWindow();
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    const cleanup = mount(win);

    expect(fullscreen.disabled).toBe(false);
    expect(fullscreen.checked).toBe(true);

    fullscreen.checked = false;
    fullscreen.dispatchEvent(new win.Event('change', { bubbles: true }));

    cleanup?.();
  });

  test('clicking Present enters presentation mode at slide 0', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    present(win);

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(activeSlideIndex(win)).toBe('0');
    expect(win.document.querySelector('[data-slides-counter]')).toBeNull();
    expect(
      win.document
        .querySelector('[data-slides-overlay]')
        ?.hasAttribute('hidden'),
    ).toBe(true);

    const close = win.document.querySelector(
      '[data-slides-close]',
    ) as HTMLButtonElement;
    close.click();

    expect(win.document.body.classList.contains('is-presenting')).toBe(false);
    expect(win.document.querySelector('.slide.is-active')).toBeNull();

    cleanup?.();
  });

  test('ArrowRight and ArrowLeft change the active slide', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    setTraceNavigationReady(win);
    present(win);

    dispatchKey(win, 'ArrowRight');
    expect(activeSlideIndex(win)).toBe('1');

    dispatchKey(win, 'ArrowLeft');
    expect(activeSlideIndex(win)).toBe('0');

    dispatchKey(win, 'Escape');
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);

    cleanup?.();
  });

  test('Space advances slides with the same behavior as ArrowRight', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    setTraceNavigationReady(win);
    present(win);

    dispatchKey(win, ' ');
    expect(activeSlideIndex(win)).toBe('1');

    cleanup?.();
  });

  test('tada:slides-present starts normal presentation at the requested slide when Full screen is unchecked', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    (
      win.document.querySelector('[data-slides-fullscreen]') as HTMLInputElement
    ).checked = false;
    win.document
      .querySelector('[data-slides-root]')!
      .dispatchEvent(
        new win.CustomEvent('tada:slides-present', {
          bubbles: true,
          detail: { slideIndex: 2 },
        }),
      );

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(activeSlideIndex(win)).toBe('2');

    cleanup?.();
  });

  test('tada:slides-present clamps requested slide index', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    win.document
      .querySelector('[data-slides-root]')!
      .dispatchEvent(
        new win.CustomEvent('tada:slides-present', {
          bubbles: true,
          detail: { slideIndex: 99 },
        }),
      );

    expect(activeSlideIndex(win)).toBe('2');

    cleanup?.();
  });

  test('fullscreen custom event falls back to normal mode when fullscreen is unavailable', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    win.document
      .querySelector('[data-slides-root]')!
      .dispatchEvent(
        new win.CustomEvent('tada:slides-present', {
          bubbles: true,
          detail: { slideIndex: 1 },
        }),
      );

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(activeSlideIndex(win)).toBe('1');

    cleanup?.();
  });

  test('cleanup removes listeners and inserted UI', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const presentButton = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;

    presentButton.click();

    expect(win.document.querySelector('[data-slides-overlay]')).not.toBeNull();

    cleanup?.();

    expect(win.document.querySelector('[data-slides-overlay]')).toBeNull();
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);

    presentButton.click();
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);

    win.document
      .querySelector('[data-slides-root]')!
      .dispatchEvent(
        new win.CustomEvent('tada:slides-present', {
          bubbles: true,
          detail: { slideIndex: 1 },
        }),
      );
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);
  });

  test('Space drives an active trace before changing slides', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    let nextClicks = 0;

    traceNext.addEventListener('click', () => {
      nextClicks += 1;
      traceNext.disabled = true;
      tracePrev.disabled = false;
    });

    markTraceReady(win.document.querySelector('.trace-widget'));
    present(win);
    dispatchKey(win, ' ');

    expect(nextClicks).toBe(1);
    expect(activeSlideIndex(win)).toBe('0');

    cleanup?.();
  });

  test('ArrowLeft resets a trace after returning to its slide', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    const traceFirst = win.document.createElement('button');
    traceFirst.className = 'trace-first';
    traceFirst.disabled = true;

    let nextClicks = 0;
    let prevClicks = 0;
    let resetClicks = 0;

    traceNext.addEventListener('click', () => {
      nextClicks += 1;
      traceFirst.disabled = false;
      traceNext.disabled = true;
      tracePrev.disabled = false;
    });
    tracePrev.addEventListener('click', () => {
      prevClicks += 1;
      traceFirst.disabled = true;
      tracePrev.disabled = true;
      traceNext.disabled = false;
    });
    traceFirst.addEventListener('click', () => {
      resetClicks += 1;
      traceFirst.disabled = true;
      tracePrev.disabled = true;
      traceNext.disabled = false;
    });

    const traceWidget = win.document.querySelector(
      '.trace-widget',
    ) as HTMLElement;
    traceWidget.querySelector('.trace-controls')?.prepend(traceFirst);
    markTraceReady(traceWidget);
    present(win);

    dispatchKey(win, 'ArrowRight');
    expect(nextClicks).toBe(1);
    expect(activeSlideIndex(win)).toBe('0');

    dispatchKey(win, 'ArrowRight');
    expect(activeSlideIndex(win)).toBe('1');

    dispatchKey(win, 'ArrowLeft');
    expect(activeSlideIndex(win)).toBe('0');
    expect(resetClicks).toBe(1);
    expect(traceFirst.disabled).toBe(true);
    expect(tracePrev.disabled).toBe(true);
    expect(traceNext.disabled).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(prevClicks).toBe(0);
    expect(activeSlideIndex(win)).toBe('0');

    cleanup?.();
  });

  test('ArrowRight drives a later ready trace before advancing the slide', () => {
    const win = createSlidesWindowWithMultipleTraces();
    const cleanup = mount(win);
    const firstWidget = win.document.querySelector(
      '[data-trace-id="first-next"]',
    ) as HTMLElement;
    const secondWidget = win.document.querySelector(
      '[data-trace-id="second-next"]',
    ) as HTMLElement;
    const secondNext = secondWidget.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    let secondNextClicks = 0;

    secondNext.addEventListener('click', () => {
      secondNextClicks += 1;
      secondNext.disabled = true;
    });

    markTraceReady(firstWidget);
    markTraceReady(secondWidget);
    present(win);
    dispatchKey(win, 'ArrowRight');

    expect(secondNextClicks).toBe(1);
    expect(activeSlideIndex(win)).toBe('0');

    cleanup?.();
  });

  test('ArrowRight advances the slide before a trace has initialized', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    present(win);
    dispatchKey(win, 'ArrowRight');

    expect(activeSlideIndex(win)).toBe('1');

    cleanup?.();
  });

  test('ArrowLeft drives a later ready trace before moving to the previous slide', () => {
    const win = createSlidesWindowWithMultipleTraces();
    const cleanup = mount(win);
    const firstSlideSecondNext = win.document
      .querySelector('[data-trace-id="second-next"]')
      ?.querySelector('.trace-next') as HTMLButtonElement;
    const secondSlideSecondWidget = win.document.querySelector(
      '[data-trace-id="second-prev"]',
    ) as HTMLElement;
    const secondSlidePrev = secondSlideSecondWidget.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    let prevClicks = 0;

    secondSlidePrev.addEventListener('click', () => {
      prevClicks += 1;
      secondSlidePrev.disabled = true;
    });

    markTraceReady(
      win.document.querySelector('[data-trace-id="first-next"]') as HTMLElement,
    );
    markTraceReady(
      win.document.querySelector(
        '[data-trace-id="second-next"]',
      ) as HTMLElement,
    );
    markTraceReady(
      win.document.querySelector('[data-trace-id="first-prev"]') as HTMLElement,
    );
    markTraceReady(secondSlideSecondWidget);

    firstSlideSecondNext.disabled = true;
    present(win);
    dispatchKey(win, 'ArrowRight');
    expect(activeSlideIndex(win)).toBe('1');

    dispatchKey(win, 'ArrowLeft');

    expect(prevClicks).toBe(1);
    expect(activeSlideIndex(win)).toBe('1');

    cleanup?.();
  });

  test('re-entering presentation resets ready traces to their first step', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const close = () =>
      (
        win.document.querySelector('[data-slides-close]') as HTMLButtonElement
      ).click();
    const traceWidget = win.document.querySelector(
      '.trace-widget',
    ) as HTMLElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    const traceFirst = win.document.createElement('button');
    traceFirst.className = 'trace-first';
    traceFirst.disabled = true;
    let resetClicks = 0;

    traceFirst.addEventListener('click', () => {
      resetClicks += 1;
      traceFirst.disabled = true;
      tracePrev.disabled = true;
      traceNext.disabled = false;
    });
    traceWidget.querySelector('.trace-controls')?.prepend(traceFirst);
    markTraceReady(traceWidget);

    present(win);
    traceNext.addEventListener('click', () => {
      traceFirst.disabled = false;
      tracePrev.disabled = false;
      traceNext.disabled = true;
    });
    dispatchKey(win, 'ArrowRight');
    close();
    present(win);

    expect(resetClicks).toBe(1);
    expect(traceFirst.disabled).toBe(true);
    expect(tracePrev.disabled).toBe(true);
    expect(traceNext.disabled).toBe(false);

    cleanup?.();
  });
});
