import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(top: number) {
  const dom = new JSDOM(
    '<body><nav class="breadcrumbs" style="top: 45px"><ol></ol></nav></body>',
  );
  const trail = dom.window.document.querySelector('nav')!;
  const position = { top };
  trail.getBoundingClientRect = () =>
    ({ top: position.top, height: 36 }) as DOMRect;
  return { window: dom.window, trail, position };
}

describe('breadcrumbs', () => {
  test('marks the trail stuck only when it reaches its sticky offset', () => {
    const { window, trail, position } = create(57);
    mount(window as unknown as Window);
    expect(trail.classList.contains('is-stuck')).toBe(false);

    position.top = 45;
    window.dispatchEvent(new window.Event('scroll'));
    expect(trail.classList.contains('is-stuck')).toBe(true);

    position.top = 57;
    window.dispatchEvent(new window.Event('scroll'));
    expect(trail.classList.contains('is-stuck')).toBe(false);
  });

  test('cleanup stops tracking and clears the class', () => {
    const { window, trail, position } = create(45);
    const cleanup = mount(window as unknown as Window);
    expect(trail.classList.contains('is-stuck')).toBe(true);

    cleanup?.();
    expect(trail.classList.contains('is-stuck')).toBe(false);
    position.top = 45;
    window.dispatchEvent(new window.Event('scroll'));
    expect(trail.classList.contains('is-stuck')).toBe(false);
  });

  test('does nothing on pages without a trail', () => {
    const window = new JSDOM('<body></body>').window as unknown as Window;
    expect(mount(window)).toBeUndefined();
  });
});
