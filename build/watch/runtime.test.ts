import { beforeEach, expect, mock, test } from 'bun:test';
import type { TadaBuildMeta } from '../build-types';
import type { SiteVariables } from '../types';

const runners: { runs: number }[] = [];

mock.module('../serve', () => ({
  startServer: () => ({ port: 8080, publish() {}, stop() {} }),
}));
mock.module('../pagefind', () => ({
  WatchPagefindRunner: class {
    state = { runs: 0 };
    constructor() {
      runners.push(this.state);
    }
    update() {}
    run() {
      this.state.runs++;
    }
  },
}));

const { TadaWatchRuntime } = await import('./runtime');

function meta(title: string): TadaBuildMeta {
  return {
    htmlAssetsByPath: new Map(),
    htmlAnalysisByPath: new Map(),
    pdfSourceByOutputPath: new Map(),
    siteVariables: {
      title,
      features: { search: true, favicon: false, footer: true, pickers: true },
    } as SiteVariables,
  };
}

beforeEach(() => {
  runners.length = 0;
});

test('one search indexer serves every build, even after a site config change', async () => {
  const runtime = new TadaWatchRuntime({ distDir: '/site/dist' });

  await runtime.onEvent({ kind: 'build-succeeded', meta: meta('Before') });
  await runtime.onEvent({
    kind: 'build-succeeded',
    paths: new Set(['/site/site.dev.yaml']),
    meta: meta('After'),
  });
  await new Promise(resolve => setImmediate(resolve));

  // A second indexer could overwrite files while the first is still writing.
  expect(runners).toEqual([{ runs: 2 }]);
  runtime.close();
});
