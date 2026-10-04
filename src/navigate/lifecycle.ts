import mountTableOfContents from '../toc';
import mountAnchor from '../anchor';
import mountQuestion from '../question';
import mountTimeZone from '../timezone';
import mountCode from '../code';
import mountTrace from '../trace';
import mountPrint from '../print';
import mountSlides from '../slides';
import mountAppearancePicker from '../appearance-picker';
import { scheduleTask } from '../util';

const PER_PAGE_COMPONENTS: Record<
  string,
  (w: Window) => void | (() => void) | Promise<void | (() => void)>
> = {
  toc: mountTableOfContents,
  anchor: mountAnchor,
  question: mountQuestion,
  timeZone: mountTimeZone,
  code: mountCode,
  trace: mountTrace,
  slides: mountSlides,
  print: mountPrint,
};

let cleanups: (() => void)[] = [];
let appearancePickerMounted = false;

// Navigation calls this during the swap so the new transition snapshot shows
// enabled switches with the visitor's preferences, rather than build defaults.
export function mountAppearancePickerForPage(window: Window): void {
  if (appearancePickerMounted) {
    return;
  }
  appearancePickerMounted = true;
  try {
    cleanups.push(mountAppearancePicker(window));
  } catch (err) {
    if (__IS_DEV__) {
      console.error('Failed to mount appearancePicker component:', String(err));
    }
  }
}

export async function mountPerPageComponents(
  window: Window,
): Promise<() => void> {
  mountAppearancePickerForPage(window);

  const entries = Object.entries(PER_PAGE_COMPONENTS);

  const mountPromises = entries.map(([name, mount]) => {
    return new Promise<void>((resolve, reject) => {
      scheduleTask(window, async () => {
        try {
          const cleanup = await mount(window);
          if (typeof cleanup === 'function') {
            cleanups.push(cleanup);
          }
          resolve();
        } catch (err) {
          if (__IS_DEV__) {
            console.error(`Failed to mount ${name} component:`, String(err));
          }
          reject();
        }
      });
    });
  });

  await Promise.allSettled(mountPromises);

  return teardownPerPageComponents;
}

export function teardownPerPageComponents(): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // ignore teardown errors
    }
  }
  cleanups = [];
  appearancePickerMounted = false;
}
