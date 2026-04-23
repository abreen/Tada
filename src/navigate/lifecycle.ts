import mountTableOfContents from '../toc';
import mountAnchor from '../anchor';
import mountQuestion from '../question';
import mountTimeZone from '../timezone';
import mountCode from '../code';
import mountTrace from '../trace';
import mountPrint from '../print';
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
  print: mountPrint,
};

let cleanups: (() => void)[] = [];

export async function mountPerPageComponents(
  window: Window,
): Promise<() => void> {
  cleanups = [];

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
}
