import './style.scss';

import './anchor/style.scss';
import './code.scss';
import './code/style.scss';
import './literate/style.scss';
import './header/style.scss';
import './print/style.scss';
import './question/style.scss';
import './search/style.scss';
import './timezone/style.scss';
import './toc/style.scss';
import './trace/style.scss';
import './navigate/style.scss';

import mountSearch from './search';
import mountHeader from './header';
import mountTop from './top';
import mountNavigate from './navigate';
import { mountPerPageComponents } from './navigate/lifecycle';

import { scheduleTask, formatDuration } from './util';

const PERSISTENT_COMPONENTS: Record<
  string,
  (w: Window) => void | (() => void)
> = {
  header: mountHeader,
  search: mountSearch,
  top: mountTop,
  navigate: mountNavigate,
};

let startTime = -1;

document.addEventListener('DOMContentLoaded', async () => {
  startTime = window.performance.now();

  const failed: Record<string, string> = {};

  // Mount persistent components
  const persistentEntries = Object.entries(PERSISTENT_COMPONENTS);
  const persistentPromises = persistentEntries.map(([name, mount]) => {
    return new Promise<void>((resolve, reject) => {
      scheduleTask(async () => {
        try {
          mount(window);
          resolve();
        } catch (err) {
          failed[name] = String(err);
          reject();
        }
      });
    });
  });

  await Promise.allSettled(persistentPromises);

  // Mount per-page components
  await mountPerPageComponents(window);

  for (const [name, reason] of Object.entries(failed)) {
    console.error(`Failed to mount ${name} component:`, reason);
  }

  if (__IS_DEV__) {
    const diff = window.performance.now() - startTime;
    console.info(`Components mounted in ${formatDuration(diff)}`);
  }
});
