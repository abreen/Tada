import './style.scss';
import './layout.scss';

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

import mountTableOfContents from './toc';
import mountSearch from './search';
import mountHeader from './header';
import mountPrint from './print';
import mountTop from './top';
import mountAnchor from './anchor';
import mountQuestion from './question';
import mountTimezone from './timezone';
import mountCode from './code';

import { scheduleTask, formatDuration } from './util';

const COMPONENTS = {
  toc: mountTableOfContents,
  search: mountSearch,
  header: mountHeader,
  print: mountPrint,
  top: mountTop,
  anchor: mountAnchor,
  question: mountQuestion,
  timezone: mountTimezone,
  code: mountCode,
};

let startTime = -1;

document.addEventListener('DOMContentLoaded', async () => {
  startTime = window.performance.now();

  const entries = Object.entries(COMPONENTS);

  const failed: Record<string, any> = {};

  const mountPromises = entries.map(([name, mount]) => {
    return new Promise<void>((resolve, reject) => {
      scheduleTask(async () => {
        try {
          mount(window);
          resolve();
          return;
        } catch (err) {
          failed[name] = String(err);
        }
        reject();
      });
    });
  });

  await Promise.allSettled(mountPromises);

  for (const [name, reason] of Object.entries(failed)) {
    console.error(`Failed to mount ${name} component:`, reason);
  }

  if (window.IS_DEV) {
    const diff = window.performance.now() - startTime;
    console.info(`Components mounted in ${formatDuration(diff)}`);
  }
});
