import { afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { JSDOM } from 'jsdom';

let mount: typeof import('./index').default;
let mountQuestion: typeof import('../question').default;

beforeAll(async () => {
  ({ default: mount } = await import('./index'));
  ({ default: mountQuestion } = await import('../question'));
});

afterEach(() => {
  jest.useRealTimers();
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

function createSlidesWindowWithInput(): Win {
  return createWindow(`
    <div class="slides-header">
      <button type="button" data-slides-present>Present</button>
      <label><input id="slides-fullscreen" type="checkbox" data-slides-fullscreen checked> Full screen</label>
    </div>
    <div class="slide-deck" data-slides-root>
      <div class="slide" data-slide-index="0">
        <h1>Slide 1</h1>
        <input type="text" value="hello">
      </div>
      <div class="slide" data-slide-index="1">
        <h1>Slide 2</h1>
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

function createSingleSlideTraceWindow(): Win {
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
          <div class="trace-diagram"></div>
        </div>
      </div>
    </div>
  `);
}

function createSlidesWindowWithQuestionOnLastSlide(): Win {
  return createWindow(`
    <div class="slides-header">
      <button type="button" data-slides-present>Present</button>
      <label><input id="slides-fullscreen" type="checkbox" data-slides-fullscreen checked> Full screen</label>
    </div>
    <div class="slide-deck" data-slides-root>
      <div class="slide" data-slide-index="0">
        <h1>Slide 1</h1>
      </div>
      <div class="slide" data-slide-index="1">
        <h1>Slide 2</h1>
      </div>
      <div class="slide" data-slide-index="2">
        <h1>Slide 3</h1>
        <div class="question">
          <div class="question-a">
            <div class="question-a-body" role="button" tabindex="0" aria-label="Click to reveal answer">
              <p>The answer is twelve.</p>
            </div>
          </div>
        </div>
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

function installFullscreenApi(win: Win): {
  get requestCount(): number;
  get exitCount(): number;
} {
  const doc = win.document as Document & {
    exitFullscreen?: () => Promise<void>;
    fullscreenElement?: Element | null;
  };
  let fullscreenElement: Element | null = null;
  let requestCount = 0;
  let exitCount = 0;

  Object.defineProperty(doc, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });

  (
    doc.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    }
  ).requestFullscreen = async () => {
    requestCount += 1;
    fullscreenElement = doc.documentElement;
    doc.dispatchEvent(new win.Event('fullscreenchange'));
  };

  doc.exitFullscreen = async () => {
    exitCount += 1;
    fullscreenElement = null;
    doc.dispatchEvent(new win.Event('fullscreenchange'));
  };

  return {
    get requestCount() {
      return requestCount;
    },
    get exitCount() {
      return exitCount;
    },
  };
}

function setCloseButtonBottom(win: Win, bottom: number): void {
  const close = win.document.querySelector(
    '[data-slides-close]',
  ) as HTMLButtonElement;

  Object.defineProperty(close, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 80,
      height: bottom,
      top: 0,
      right: 80,
      bottom,
      left: 0,
      toJSON() {
        return {};
      },
    }),
  });
}

describe('slides presentation controller', () => {
  test('mount re-enables Present and Full screen controls that render disabled', () => {
    const win = createSlidesWindow();
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;

    present.disabled = true;
    fullscreen.disabled = true;

    const cleanup = mount(win);

    expect(present.disabled).toBe(false);
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

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');
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

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();

    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;

    traceNext.disabled = true;
    tracePrev.disabled = true;

    dispatchKey(win, 'ArrowRight');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    dispatchKey(win, 'ArrowLeft');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    dispatchKey(win, 'Escape');
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);

    cleanup?.();
  });

  test('single click advances when presentation mode is active', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;

    present.click();
    traceNext.disabled = true;
    tracePrev.disabled = true;

    const activeSlide = win.document.querySelector('.slide') as HTMLElement;
    activeSlide.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('Space advances slides with the same behavior as ArrowRight', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;

    traceNext.disabled = true;
    tracePrev.disabled = true;
    present.click();

    dispatchKey(win, ' ');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('clicking Present requests browser fullscreen and starts at slide 0 when Full screen is checked', async () => {
    const win = createSlidesWindow();
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();
    await Promise.resolve();

    expect(fullscreenApi.requestCount).toBe(1);
    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('clicking Present starts normal presentation when Full screen is unchecked', async () => {
    const win = createSlidesWindow();
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    fullscreen.checked = false;
    present.click();
    await Promise.resolve();

    expect(fullscreenApi.requestCount).toBe(0);
    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('clicking Present starts normal presentation when stored Full screen preference is unchecked', async () => {
    const win = createSlidesWindow();
    win.localStorage.setItem('slidesFullscreen', 'false');
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();
    await Promise.resolve();

    expect(fullscreenApi.requestCount).toBe(0);
    expect(win.document.body.classList.contains('is-presenting')).toBe(true);

    cleanup?.();
  });

  test('tada:slides-present starts fullscreen presentation at the requested slide when Full screen is checked', async () => {
    const win = createSlidesWindow();
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const root = win.document.querySelector('[data-slides-root]')!;
    root.dispatchEvent(
      new win.CustomEvent('tada:slides-present', {
        bubbles: true,
        detail: { slideIndex: 2 },
      }),
    );
    await Promise.resolve();

    expect(fullscreenApi.requestCount).toBe(1);
    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    cleanup?.();
  });

  test('tada:slides-present starts normal presentation at the requested slide when Full screen is unchecked', async () => {
    const win = createSlidesWindow();
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const fullscreen = win.document.querySelector(
      '[data-slides-fullscreen]',
    ) as HTMLInputElement;
    const root = win.document.querySelector('[data-slides-root]')!;
    fullscreen.checked = false;
    root.dispatchEvent(
      new win.CustomEvent('tada:slides-present', {
        bubbles: true,
        detail: { slideIndex: 2 },
      }),
    );
    await Promise.resolve();

    expect(fullscreenApi.requestCount).toBe(0);
    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    cleanup?.();
  });

  test('tada:slides-present clamps requested slide index', async () => {
    const win = createSlidesWindow();
    installFullscreenApi(win);
    const cleanup = mount(win);

    const root = win.document.querySelector('[data-slides-root]')!;
    root.dispatchEvent(
      new win.CustomEvent('tada:slides-present', {
        bubbles: true,
        detail: { slideIndex: 99 },
      }),
    );
    await Promise.resolve();

    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    cleanup?.();
  });

  test('fullscreen custom event falls back to normal mode when fullscreen is unavailable', async () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const root = win.document.querySelector('[data-slides-root]')!;
    root.dispatchEvent(
      new win.CustomEvent('tada:slides-present', {
        bubbles: true,
        detail: { slideIndex: 1 },
      }),
    );
    await Promise.resolve();

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('fullscreen custom event keeps requested slide active when fullscreen rejects', async () => {
    const win = createSlidesWindow();
    (
      win.document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      }
    ).requestFullscreen = async () => {
      throw new Error('denied');
    };
    const cleanup = mount(win);

    const root = win.document.querySelector('[data-slides-root]')!;
    root.dispatchEvent(
      new win.CustomEvent('tada:slides-present', {
        bubbles: true,
        detail: { slideIndex: 2 },
      }),
    );
    await Promise.resolve();

    expect(win.document.body.classList.contains('is-presenting')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    cleanup?.();
  });

  test('fullscreen mode never reveals the Close button on mouse move', async () => {
    jest.useFakeTimers();

    const win = createSlidesWindow();
    installFullscreenApi(win);
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();
    await Promise.resolve();

    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;

    win.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true }));
    jest.advanceTimersByTime(4000);

    expect(overlay.hidden).toBe(true);

    cleanup?.();
  });

  test('leaving browser fullscreen exits presentation mode', async () => {
    const win = createSlidesWindow();
    const fullscreenApi = installFullscreenApi(win);
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();
    await Promise.resolve();
    await (
      win.document as Document & { exitFullscreen: () => Promise<void> }
    ).exitFullscreen();

    expect(fullscreenApi.exitCount).toBe(1);
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);
    expect(win.document.querySelector('.slide.is-active')).toBeNull();

    cleanup?.();
  });

  test('Space drives an active trace before changing slides', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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
    present.click();
    dispatchKey(win, ' ');

    expect(nextClicks).toBe(1);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('Close button only appears when the mouse is near the top reveal zone', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();
    setCloseButtonBottom(win, 60);

    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;

    expect(overlay.hidden).toBe(true);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 120 }),
    );
    expect(overlay.hidden).toBe(true);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 40 }),
    );
    expect(overlay.hidden).toBe(false);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 90 }),
    );
    expect(overlay.hidden).toBe(true);

    cleanup?.();
  });

  test('navigation gestures hide the Close button and cursor until the mouse moves again', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    traceNext.disabled = true;
    tracePrev.disabled = true;
    present.click();
    setCloseButtonBottom(win, 60);

    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 40 }),
    );
    expect(overlay.hidden).toBe(false);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(false);

    dispatchKey(win, 'ArrowRight');
    expect(overlay.hidden).toBe(true);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(true);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 120 }),
    );
    expect(overlay.hidden).toBe(true);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(false);

    dispatchKey(win, ' ');
    expect(overlay.hidden).toBe(true);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(true);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 40 }),
    );
    expect(overlay.hidden).toBe(false);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(overlay.hidden).toBe(true);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(true);

    win.dispatchEvent(
      new win.MouseEvent('mousemove', { bubbles: true, clientY: 40 }),
    );
    expect(overlay.hidden).toBe(false);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(false);

    const activeSlide = win.document.querySelector(
      '.slide.is-active',
    ) as HTMLElement;
    activeSlide.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(overlay.hidden).toBe(true);
    expect(
      win.document.body.classList.contains('is-presentation-cursor-hidden'),
    ).toBe(true);

    cleanup?.();
  });

  test('ArrowRight on the last slide keeps Close visible until the user goes back', () => {
    jest.useFakeTimers();

    const win = createSlidesWindow();
    const cleanup = mount(win);
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;

    present.click();
    dispatchKey(win, 'ArrowRight');
    dispatchKey(win, 'ArrowRight');

    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');
    expect(overlay.hidden).toBe(true);

    dispatchKey(win, 'ArrowRight');
    expect(overlay.hidden).toBe(false);

    jest.advanceTimersByTime(5000);
    expect(overlay.hidden).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(overlay.hidden).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('Space and click on the last slide keep Close visible', () => {
    jest.useFakeTimers();

    const win = createSlidesWindow();
    const cleanup = mount(win);
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;

    present.click();
    dispatchKey(win, 'ArrowRight');
    dispatchKey(win, 'ArrowRight');
    dispatchKey(win, ' ');

    expect(overlay.hidden).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(overlay.hidden).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(overlay.hidden).toBe(true);

    dispatchKey(win, 'ArrowRight');
    const activeSlide = win.document.querySelector(
      '.slide.is-active',
    ) as HTMLElement;
    activeSlide.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(overlay.hidden).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(overlay.hidden).toBe(false);

    cleanup?.();
  });

  test('cleanup removes listeners and inserted UI', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();

    expect(win.document.querySelector('[data-slides-overlay]')).not.toBeNull();

    cleanup?.();

    expect(win.document.querySelector('[data-slides-overlay]')).toBeNull();
    expect(win.document.body.classList.contains('is-presenting')).toBe(false);

    present.click();
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

  test('ArrowLeft resets a trace after returning to its slide', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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
    present.click();

    dispatchKey(win, 'ArrowRight');
    expect(nextClicks).toBe(1);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    dispatchKey(win, 'ArrowRight');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    dispatchKey(win, 'ArrowLeft');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');
    expect(resetClicks).toBe(1);
    expect(traceFirst.disabled).toBe(true);
    expect(tracePrev.disabled).toBe(true);
    expect(traceNext.disabled).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(prevClicks).toBe(0);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('ArrowRight drives a later ready trace before advancing the slide', () => {
    const win = createSlidesWindowWithMultipleTraces();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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
    present.click();
    dispatchKey(win, 'ArrowRight');

    expect(secondNextClicks).toBe(1);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('ArrowRight advances the slide before a trace has initialized', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;

    present.click();
    dispatchKey(win, 'ArrowRight');

    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('clicking Present allows immediate ArrowRight navigation', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;

    traceNext.disabled = true;
    tracePrev.disabled = true;
    present.focus();
    present.click();

    dispatchKey(win, 'ArrowRight');

    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('single click advances the active trace before changing slides', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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
    present.click();

    const activeSlide = win.document.querySelector('.slide') as HTMLElement;
    activeSlide.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(nextClicks).toBe(1);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('ArrowLeft drives a later ready trace before moving to the previous slide', () => {
    const win = createSlidesWindowWithMultipleTraces();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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
    present.click();
    dispatchKey(win, 'ArrowRight');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    dispatchKey(win, 'ArrowLeft');

    expect(prevClicks).toBe(1);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('1');

    cleanup?.();
  });

  test('ArrowLeft and ArrowRight do not navigate slides while focus is inside an interactive control', () => {
    const win = createSlidesWindowWithInput();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const input = win.document.querySelector('input') as HTMLInputElement;

    present.click();
    input.focus();

    dispatchKey(win, 'ArrowRight');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    dispatchKey(win, 'ArrowLeft');
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('0');

    cleanup?.();
  });

  test('trace toolbar is hidden while presenting and restored on exit', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const toolbar = win.document.querySelector('.trace-toolbar') as HTMLElement;
    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    present.click();

    expect(toolbar.hidden).toBe(true);
    expect(toolbar.getAttribute('aria-hidden')).toBe('true');

    dispatchKey(win, 'Escape');

    expect(toolbar.hidden).toBe(false);
    expect(toolbar.hasAttribute('aria-hidden')).toBe(false);

    cleanup?.();
  });

  test('Close waits until the last trace step before sticking on the final slide', () => {
    jest.useFakeTimers();

    const win = createSingleSlideTraceWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;
    const traceWidget = win.document.querySelector(
      '.trace-widget',
    ) as HTMLElement;
    const traceNext = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    const tracePrev = win.document.querySelector(
      '.trace-prev',
    ) as HTMLButtonElement;
    let nextClicks = 0;
    let prevClicks = 0;

    traceNext.addEventListener('click', () => {
      nextClicks += 1;
      traceNext.disabled = true;
      tracePrev.disabled = false;
    });
    tracePrev.addEventListener('click', () => {
      prevClicks += 1;
      tracePrev.disabled = true;
      traceNext.disabled = false;
    });

    markTraceReady(traceWidget);
    present.click();

    dispatchKey(win, 'ArrowRight');
    expect(nextClicks).toBe(1);
    expect(overlay.hidden).toBe(true);

    dispatchKey(win, 'ArrowRight');
    expect(overlay.hidden).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(overlay.hidden).toBe(false);

    dispatchKey(win, 'ArrowLeft');
    expect(prevClicks).toBe(1);
    expect(overlay.hidden).toBe(true);

    cleanup?.();
  });

  test('clicking a Q&A reveal on the last slide only advances after it is revealed', () => {
    const win = createSlidesWindowWithQuestionOnLastSlide();
    mountQuestion(win);
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
    const overlay = win.document.querySelector(
      '[data-slides-overlay]',
    ) as HTMLElement;
    const questionBody = win.document.querySelector(
      '.question-a-body',
    ) as HTMLElement;

    present.click();
    dispatchKey(win, 'ArrowRight');
    dispatchKey(win, 'ArrowRight');

    questionBody.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(overlay.hidden).toBe(true);
    expect(questionBody.hasAttribute('data-revealed')).toBe(true);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    questionBody.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(overlay.hidden).toBe(false);
    expect(
      win.document
        .querySelector('.slide.is-active')
        ?.getAttribute('data-slide-index'),
    ).toBe('2');

    cleanup?.();
  });

  test('re-entering presentation resets ready traces to their first step', () => {
    const win = createSlidesWindow();
    const cleanup = mount(win);

    const present = win.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;
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

    present.click();
    traceNext.addEventListener('click', () => {
      traceFirst.disabled = false;
      tracePrev.disabled = false;
      traceNext.disabled = true;
    });
    dispatchKey(win, 'ArrowRight');
    close();
    present.click();

    expect(resetClicks).toBe(1);
    expect(traceFirst.disabled).toBe(true);
    expect(tracePrev.disabled).toBe(true);
    expect(traceNext.disabled).toBe(false);

    cleanup?.();
  });
});
