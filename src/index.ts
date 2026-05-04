import './style.scss';

import './anchor/style.scss';
import './code.scss';
import './code/style.scss';
import './literate.scss';
import './header/style.scss';
import './print/style.scss';
import './question/style.scss';
import './search/style.scss';
import './slides/style.scss';
import './timezone/style.scss';
import './toc/style.scss';
import './trace/style.scss';
import './navigate/style.scss';
import './page-update/style.scss';

import mountSearch from './search';
import mountHeader from './header';
import mountTop from './top';
import mountNavigate from './navigate';
import mountPageUpdate from './page-update';
import { mountPerPageComponents } from './navigate/lifecycle';
import { getHashTarget } from './hash-target';

import { scheduleTask, formatDuration } from './util';

const PERSISTENT_COMPONENTS: Record<
  string,
  (w: Window) => void | (() => void)
> = {
  header: mountHeader,
  search: mountSearch,
  top: mountTop,
  navigate: mountNavigate,
  pageUpdate: mountPageUpdate,
};

let startTime = -1;

document.addEventListener('DOMContentLoaded', async () => {
  startTime = window.performance.now();

  const failed: Record<string, string> = {};

  // Mount persistent components
  const persistentEntries = Object.entries(PERSISTENT_COMPONENTS);
  const persistentPromises = persistentEntries.map(([name, mount]) => {
    return new Promise<void>((resolve, reject) => {
      scheduleTask(window, async () => {
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

  // On reload with manual scrollRestoration, browsers skip the initial
  // fragment scroll. Do it ourselves once per-page components have
  // finished mutating the DOM. On a fresh cold load the browser already
  // scrolled, so this is a harmless re-align.
  if (window.location.hash) {
    getHashTarget(window.document, window.location.hash)?.scrollIntoView();
  }

  for (const [name, reason] of Object.entries(failed)) {
    console.error(`Failed to mount ${name} component:`, reason);
  }

  if (__IS_DEV__) {
    const diff = window.performance.now() - startTime;
    console.info(`Components mounted in ${formatDuration(diff)}`);
  }
});
