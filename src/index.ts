import './style.scss';
import './code.scss';
import './layout.scss';
import './print.scss';
import './toc/style.scss';
import './search/style.scss';
import './header/style.scss';
import './top/style.scss';
import './anchor/style.scss';
import './timezone/style.scss';
import './question/style.scss';

import mountTableOfContents from './toc';
import mountSearch from './search';
import mountHeader from './header';
import mountPrint from './print';
import mountTop from './top';
import mountAnchor from './anchor';
import mountFootnotes from './footnotes';
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
  footnotes: mountFootnotes,
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
