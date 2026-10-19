import path from 'path';
import {
  createEmptyAuthorScripts,
  type AuthorScripts,
} from '../author-scripts';
import { describe, expect, test } from 'bun:test';
import {
  createTadaWatchPlan,
  diffAuthorKeys,
  documentIndexMayChange,
  getRendererDependentSources,
  getScriptDependentSources,
  shouldRecompileScripts,
} from './planner';
import { indexSources, type SourceEntry } from '../source-model';
import { createSnapshot, type TadaSnapshot } from '../site-build';
import type { TadaSourceRecord } from '../source-records';

const root = path.resolve('planner-site');
const source = (name: string) => path.join(root, name);
const siteVariables: TadaSnapshot['siteVariables'] = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
  themeColor: 'black',
  features: { search: true, favicon: true, footer: true, pickers: true },
};
function record(
  name: string,
  outputs: string[],
  deps: Partial<TadaSourceRecord> = {},
): TadaSourceRecord {
  return {
    sourcePath: source(name),
    kind: name.startsWith('public/') ? 'public' : 'content',
    outputs: new Map(outputs.map(output => [output, output])),
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    wikiTitles: new Set(),
    ...deps,
  };
}
// Front matter titles of record fixtures, as the scan reads them
const titles = new WeakMap<TadaSourceRecord, string>();
function titled(record: TadaSourceRecord, title: string): TadaSourceRecord {
  titles.set(record, title);
  return record;
}
function scan(records: TadaSourceRecord[]) {
  return indexSources(
    {
      contentDir: source('content'),
      publicDir: source('public'),
      distDir: source('dist'),
      processedExts: new Set(['md', 'html']),
    },
    new Map(
      records.map(record => [
        record.sourcePath,
        {
          kind: record.kind,
          renderKind:
            record.kind === 'public' ? 'public-copy' : 'plain-text-page',
          outputs: new Set(record.outputs.keys()),
          targets: new Set(
            [...record.outputs.keys()].map(output => '/' + output),
          ),
          ...(titles.has(record) ? { title: titles.get(record) } : {}),
        } satisfies SourceEntry,
      ]),
    ),
  );
}
function snapshot(records: TadaSourceRecord[]) {
  return createSnapshot({
    siteVariables,
    assetFiles: [],
    authorScripts: createEmptyAuthorScripts(),
    documentIndex: new Map(),
    authorsData: {},
    scan: scan(records),
    records: new Map(
      records
        .filter(record => record.outputs.size > 0)
        .map(record => [record.sourcePath, record]),
    ),
  });
}
function plan(
  before: TadaSourceRecord[],
  after: TadaSourceRecord[],
  changes: string[],
  extra: Partial<Parameters<typeof createTadaWatchPlan>[0]> = {},
) {
  const previous = snapshot(before);
  const nextScan = scan(after);
  const sources = new Map(nextScan.sources);
  for (const record of after) {
    if (
      before.includes(record) &&
      !changes.map(source).includes(record.sourcePath)
    ) {
      sources.set(
        record.sourcePath,
        previous.scan.sources.get(record.sourcePath)!,
      );
    }
  }
  const result = createTadaWatchPlan({
    snapshot: previous,
    scan: { ...nextScan, sources },
    paths: new Set(changes.map(source)),
    documentIndex: previous.documentIndex,
    ...extra,
  });
  return result;
}

test('diffAuthorKeys returns changed and added keys only', () => {
  expect(
    diffAuthorKeys(
      { alex: { name: 'Alex' }, sam: { name: 'Sam' } },
      { alex: { name: 'Alexandra' }, sam: { name: 'Sam' }, taylor: {} },
    ),
  ).toEqual(new Set(['alex', 'taylor']));
});

test('partial edits rebuild dependents', () => {
  const partial = record('content/_greeting.md', []);
  const page = record('content/page.md', ['page.html'], {
    partialDeps: new Set([partial.sourcePath]),
  });
  const result = plan(
    [partial, page],
    [partial, page],
    ['content/_greeting.md'],
  );
  expect(result.renderSources).toEqual(
    new Set([partial.sourcePath, page.sourcePath]),
  );
});

describe('wikilinks', () => {
  const linker = record('content/linker.md', ['linker.html'], {
    wikiTitles: new Set(['Foo']),
  });

  test('retitling a page re-renders pages that link to the old title', () => {
    const before = titled(record('content/foo.md', ['foo.html']), 'Foo');
    const after = titled(record('content/foo.md', ['foo.html']), 'Bar');
    const result = plan([before, linker], [after, linker], ['content/foo.md']);
    expect(result.renderSources).toEqual(
      new Set([after.sourcePath, linker.sourcePath]),
    );
  });

  test('a new page with a linked title re-renders the linking page', () => {
    const added = titled(record('content/foo.md', ['foo.html']), 'Foo');
    const result = plan([linker], [added, linker], ['content/foo.md']);
    expect(result.renderSources.has(linker.sourcePath)).toBe(true);
  });

  test('moving a titled page re-renders the linking page', () => {
    const before = titled(record('content/foo.md', ['foo.html']), 'Foo');
    const after = titled(record('content/moved.md', ['moved.html']), 'Foo');
    const result = plan(
      [before, linker],
      [after, linker],
      ['content/foo.md', 'content/moved.md'],
    );
    expect(result.renderSources.has(linker.sourcePath)).toBe(true);
  });

  test('retitling an unlinked page leaves the linking page alone', () => {
    const foo = titled(record('content/foo.md', ['foo.html']), 'Foo');
    const before = titled(record('content/bar.md', ['bar.html']), 'Bar');
    const after = titled(record('content/bar.md', ['bar.html']), 'Baz');
    const result = plan(
      [foo, before, linker],
      [foo, after, linker],
      ['content/bar.md'],
    );
    expect(result.renderSources).toEqual(new Set([after.sourcePath]));
  });
});

test('deleting an unreferenced page leaves the root untouched', () => {
  const home = record('content/index.md', ['index.html']);
  const orphan = record('content/orphan.md', ['orphan.html']);
  const result = plan([home, orphan], [home], ['content/orphan.md']);
  expect(result.renderSources.size).toBe(0);
  expect(result.removeSources).toEqual(new Set([orphan.sourcePath]));
});

test('deleting a page does not rebuild siblings sharing its dependencies', () => {
  const deps = {
    partialDeps: new Set([source('content/_shared.md')]),
    traceDeps: new Set([source('content/Trace.java')]),
  };
  const removed = record('content/removed.md', ['removed.html'], deps);
  const sibling = record('content/sibling.md', ['sibling.html'], deps);
  const result = plan([removed, sibling], [sibling], ['content/removed.md']);
  expect(result.renderSources.size).toBe(0);
  expect(result.removeSources).toEqual(new Set([removed.sourcePath]));
});

test.each(['about.html', 'assets/logo.svg'])(
  'public handoff restores the content producer of %s',
  output => {
    const content = record('content/' + output, [output]);
    const pub = record('public/' + output, [output]);
    const result = plan([content, pub], [content], ['public/' + output]);
    expect(result.renderSources).toEqual(new Set([content.sourcePath]));
    expect(result.removeSources).toEqual(new Set([pub.sourcePath]));
  },
);

test('removing the previous owner rebuilds the surviving content producer', () => {
  const removed = record('content/about.md', ['about.html']);
  const survivor = record('content/about.html', ['about.html']);
  const result = plan([removed], [survivor], ['content/about.md']);
  expect(result.renderSources).toEqual(new Set([survivor.sourcePath]));
  expect(result.removeSources).toEqual(new Set([removed.sourcePath]));
});

test('file, target and author dependencies invalidate independently', () => {
  const trace = record('content/Trace.java', ['Trace.java']);
  const page = record('content/page.md', ['page.html'], {
    traceDeps: new Set([trace.sourcePath]),
    internalTargets: new Set(['/Trace.java']),
    authorKey: 'alex',
  });
  const plain = record('content/plain.md', ['plain.html']);
  expect(
    plan([page, plain, trace], [page, plain, trace], ['content/Trace.java'])
      .renderSources,
  ).toEqual(new Set([trace.sourcePath, page.sourcePath]));
  expect(
    plan([page, plain, trace], [page, plain], ['content/Trace.java'])
      .renderSources,
  ).toEqual(new Set([page.sourcePath]));
  expect(
    plan([page, plain], [page, plain], [], {
      changedAuthors: new Set(['alex']),
    }).renderSources,
  ).toEqual(new Set([page.sourcePath]));
});

test('skipping a page schedules its record replacement and invalidates inbound links', () => {
  const page = record('content/page.md', ['page.html']);
  const inbound = record('content/inbound.md', ['inbound.html'], {
    internalTargets: new Set(['/page.html']),
  });
  expect(
    plan(
      [page, inbound],
      [record('content/page.md', []), inbound],
      ['content/page.md'],
    ).renderSources,
  ).toEqual(new Set([page.sourcePath, inbound.sourcePath]));
});

test('directory reconciliation invalidates partial dependents without individual file events', () => {
  const partial = record('content/parts/_shared.md', []);
  const page = record('content/page.md', ['page.html'], {
    partialDeps: new Set([partial.sourcePath]),
  });
  const nextPartial = record('content/parts/_shared.md', []);
  const unrelated = record('content/unrelated.md', ['unrelated.html']);
  expect(snapshot([partial, page]).records.has(partial.sourcePath)).toBe(false);
  expect(
    plan(
      [partial, page, unrelated],
      [nextPartial, page, unrelated],
      ['content/parts'],
    ).renderSources,
  ).toEqual(new Set([partial.sourcePath, page.sourcePath]));
  const deleted = plan(
    [partial, page, unrelated],
    [page, unrelated],
    ['content/parts'],
  );
  expect(deleted.renderSources).toEqual(new Set([page.sourcePath]));
  expect(deleted.removeSources.size).toBe(0);
});

test('route ownership changes invalidate links even when the pathname stays valid', () => {
  const generated = record('content/destination.md', ['destination.html']);
  const copied = record('public/destination.html', ['destination.html']);
  const inbound = record('content/inbound.md', ['inbound.html'], {
    internalTargets: new Set(['/destination.html']),
  });
  expect(
    plan([generated, inbound], [copied, inbound], []).renderSources.has(
      inbound.sourcePath,
    ),
  ).toBe(true);
  expect(
    plan([copied, inbound], [generated, inbound], []).renderSources.has(
      inbound.sourcePath,
    ),
  ).toBe(true);
});

describe('getScriptDependentSources', () => {
  const pages = indexSources(
    {
      contentDir: source('content'),
      publicDir: source('public'),
      distDir: source('dist'),
      processedExts: new Set(['md', 'ts']),
    },
    new Map<string, SourceEntry>([
      [
        source('content/a.md'),
        {
          kind: 'content',
          renderKind: 'plain-text-page',
          outputs: new Set(['a.html']),
          targets: new Set(),
          scripts: ['a.ts'],
        },
      ],
      [
        source('content/b.md'),
        {
          kind: 'content',
          renderKind: 'plain-text-page',
          outputs: new Set(['b.html']),
          targets: new Set(),
          scripts: ['b.ts'],
        },
      ],
      [
        source('content/Demo.ts'),
        {
          kind: 'content',
          renderKind: 'code-page',
          outputs: new Set(['Demo.ts.html']),
          targets: new Set(),
        },
      ],
      [
        source('content/image.png'),
        {
          kind: 'content',
          renderKind: 'content-copy',
          outputs: new Set(['image.png']),
          targets: new Set(),
        },
      ],
    ]),
  );
  const entries = (
    list: Record<string, { js: string; css: string[] }>,
  ): Map<string, { js: string; css: string[] }> =>
    new Map(Object.entries(list));
  const a = { js: '_scripts/a.js', css: [] };
  const b = { js: '_scripts/b.js', css: [] };

  test('re-renders nothing when no script outputs changed', () => {
    expect(
      getScriptDependentSources(
        pages,
        siteVariables,
        entries({ 'a.ts': a, 'b.ts': b }),
        entries({ 'a.ts': a, 'b.ts': b }),
      ),
    ).toEqual(new Set());
  });

  test('re-renders the pages that list a script whose outputs changed', () => {
    expect(
      getScriptDependentSources(
        pages,
        siteVariables,
        entries({ 'a.ts': a, 'b.ts': b }),
        entries({ 'a.ts': { ...a, css: ['_scripts/a.css'] }, 'b.ts': b }),
      ),
    ).toEqual(new Set([source('content/a.md')]));
  });

  test('re-renders a page whose script now exists', () => {
    expect(
      getScriptDependentSources(
        pages,
        siteVariables,
        entries({ 'a.ts': a }),
        entries({ 'a.ts': a, 'b.ts': b }),
      ),
    ).toEqual(new Set([source('content/b.md')]));
  });

  test('re-renders every page when a site-wide script changed', () => {
    expect(
      getScriptDependentSources(
        pages,
        { ...siteVariables, scripts: ['site.ts'] },
        entries({}),
        entries({ 'site.ts': a }),
      ),
    ).toEqual(
      new Set([
        source('content/a.md'),
        source('content/b.md'),
        source('content/Demo.ts'),
      ]),
    );
  });

  test('re-renders the pages of scripts with renderers, even if unchanged', () => {
    const renderers = new Map([['a.ts', {}]]);
    expect(
      getRendererDependentSources(pages, siteVariables, renderers, renderers),
    ).toEqual(new Set([source('content/a.md')]));
  });

  test('re-renders the pages of a script whose renderer was removed', () => {
    expect(
      getRendererDependentSources(
        pages,
        siteVariables,
        new Map([['b.ts', {}]]),
        undefined,
      ),
    ).toEqual(new Set([source('content/b.md')]));
  });

  test('re-renders nothing when no script has a renderer', () => {
    expect(
      getRendererDependentSources(pages, siteVariables, undefined, undefined),
    ).toEqual(new Set());
  });
});

describe('shouldRecompileScripts', () => {
  const srcDir = source('src');
  const compiled = {
    // missing.ts was asked for but does not exist, so it has no entry
    requested: ['a.ts', 'missing.ts'],
    outputs: new Map(),
    entries: new Map([['a.ts', { js: '_scripts/a.js', css: [] }]]),
  };

  test('skips recompiling when nothing in src/ or the script lists changed', () => {
    expect(
      shouldRecompileScripts({
        paths: new Set([source('content/page.md')]),
        srcDir,
        scripts: ['missing.ts', 'a.ts'],
        compiled,
      }),
    ).toBe(false);
  });

  test('recompiles when the renderer worker failed, such as by timing out', () => {
    const withHost = (failed: boolean) => ({
      ...compiled,
      rendererHost: { failed } as AuthorScripts['rendererHost'],
    });
    const options = {
      paths: new Set([source('content/page.md')]),
      srcDir,
      scripts: ['missing.ts', 'a.ts'],
    };
    expect(
      shouldRecompileScripts({ ...options, compiled: withHost(true) }),
    ).toBe(true);
    expect(
      shouldRecompileScripts({ ...options, compiled: withHost(false) }),
    ).toBe(false);
  });

  test('recompiles after a change in src/', () => {
    expect(
      shouldRecompileScripts({
        paths: new Set([path.join(srcDir, 'lib', 'helper.ts')]),
        srcDir,
        scripts: ['a.ts', 'missing.ts'],
        compiled,
      }),
    ).toBe(true);
  });

  test('recompiles when the src/ directory itself changed', () => {
    expect(
      shouldRecompileScripts({
        paths: new Set([srcDir]),
        srcDir,
        scripts: ['a.ts', 'missing.ts'],
        compiled,
      }),
    ).toBe(true);
  });

  test('recompiles when a page lists a different script', () => {
    expect(
      shouldRecompileScripts({
        paths: new Set([source('content/page.md')]),
        srcDir,
        scripts: ['a.ts', 'b.ts'],
        compiled,
      }),
    ).toBe(true);
  });

  test('ignores a file whose name only starts like src/', () => {
    expect(
      shouldRecompileScripts({
        paths: new Set([source('src-notes.md')]),
        srcDir,
        scripts: ['a.ts', 'missing.ts'],
        compiled,
      }),
    ).toBe(false);
  });
});

test('pages whose document navigation changed are rendered', () => {
  const guide = record('content/guide.md', ['guide.html']);
  const install = record('content/install.md', ['install.html']);
  const other = record('content/other.md', ['other.html']);
  const link = (title: string, href: string) => ({
    title,
    titleHtml: title,
    href,
    isCodePage: false,
  });
  const navigation = (title: string) => ({
    indexFile: 'content/index.yml',
    ancestors: [],
    tree: {
      ...link('Guide', '/guide.html'),
      current: false,
      isBranch: true,
      children: [],
    },
    next: link(title, '/install.html'),
  });
  const previous = snapshot([guide, install, other]);
  const result = createTadaWatchPlan({
    snapshot: {
      ...previous,
      documentIndex: new Map([[guide.sourcePath, navigation('Install')]]),
    },
    scan: previous.scan,
    paths: new Set([install.sourcePath]),
    documentIndex: new Map([[guide.sourcePath, navigation('Installing')]]),
  });
  expect(result.renderSources).toEqual(
    new Set([guide.sourcePath, install.sourcePath]),
  );
});

describe('documentIndexMayChange', () => {
  const indexFile = source('content/guide/index.yml');
  const listed = record('content/guide/page.md', ['guide/page.html']);
  const other = record('content/other.md', ['other.html']);
  const before = snapshot([listed, other]);
  const withIndexFile = {
    ...before.scan,
    sources: new Map([
      ...before.scan.sources,
      [
        indexFile,
        {
          kind: 'content',
          renderKind: 'document-index',
          outputs: new Set(),
          targets: new Set(),
        } satisfies SourceEntry,
      ],
    ]),
  };
  const indexed = {
    scan: withIndexFile,
    documentIndex: new Map([[listed.sourcePath, {} as never]]),
  };
  const mayChange = (changes: string[]) =>
    documentIndexMayChange(
      new Set(changes.map(source)),
      indexed,
      withIndexFile,
    );

  test('index files, listed pages, and directories holding them', () => {
    expect(mayChange(['content/guide/index.yml'])).toBe(true);
    expect(mayChange(['content/guide/page.md'])).toBe(true);
    expect(mayChange(['content/guide'])).toBe(true);
    expect(mayChange(['content'])).toBe(true);
  });

  test('an index file added since the snapshot', () => {
    expect(
      documentIndexMayChange(new Set([indexFile]), before, withIndexFile),
    ).toBe(true);
  });

  test('not other pages, scripts, or similarly named paths', () => {
    expect(mayChange(['content/other.md'])).toBe(false);
    expect(mayChange(['src/styles.scss'])).toBe(false);
    expect(mayChange(['content/gui'])).toBe(false);
    expect(mayChange(['public/index.yml'])).toBe(false);
  });
});
