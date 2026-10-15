import path from 'path';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createGlobals } from './globals.test';
import {
  buildDocumentIndex,
  getChangedDocumentPages,
  type DocumentIndexFile,
  type DocumentPageTitle,
  type DocumentTreeEntry,
} from './document-index';
import {
  indexSources,
  type SourceEntry,
  type TadaProjectScan,
  type TadaSourceRenderKind,
} from './source-model';

const SITE_ROOT = path.resolve(path.sep, 'site');

function contentPath(relPath: string): string {
  return path.join(SITE_ROOT, 'content', ...relPath.split('/'));
}

function makeScan(
  sources: Record<string, TadaSourceRenderKind>,
): TadaProjectScan {
  return indexSources(
    {
      contentDir: contentPath(''),
      publicDir: path.join(SITE_ROOT, 'public'),
      distDir: path.join(SITE_ROOT, 'dist'),
      processedExts: new Set(['md', 'java']),
    },
    new Map(
      Object.entries(sources).map(
        ([relPath, renderKind]): [string, SourceEntry] => {
          const html =
            renderKind === 'code-page'
              ? `${relPath}.html`
              : relPath.replace(
                  /(\.java)?\.md$/,
                  (_, java) => `${java ?? ''}.html`,
                );
          const outputs = [
            'plain-text-page',
            'code-page',
            'literate-java',
          ].includes(renderKind)
            ? new Set([html])
            : new Set<string>();
          return [
            contentPath(relPath),
            { kind: 'content', renderKind, outputs, targets: new Set() },
          ];
        },
      ),
    ),
  );
}

const SITE = makeScan({
  'index.md': 'plain-text-page',
  'guide/index.md': 'plain-text-page',
  'guide/index.yml': 'document-index',
  'guide/install.md': 'plain-text-page',
  'guide/topics/index.md': 'plain-text-page',
  'guide/topics/deep.md': 'plain-text-page',
  'guide/topics/wide.md': 'plain-text-page',
  'guide/Foo.java': 'code-page',
  'guide/Hello.java.md': 'literate-java',
  'guide/_partial.md': 'skip',
  'guide/data.txt': 'content-copy',
  'guide/a b.md': 'plain-text-page',
});

function titleFromPath(sourcePath: string): DocumentPageTitle {
  const name = path.basename(sourcePath);
  return { title: name, titleHtml: `<em>${name}</em>` };
}

function guideIndex(value: unknown): DocumentIndexFile {
  return { filePath: contentPath('guide/index.yml'), value };
}

const GUIDE = guideIndex({
  page: 'index.md',
  children: [
    'install.md',
    { page: 'topics/index.md', children: ['topics/deep.md', 'topics/wide.md'] },
    'Foo.java',
  ],
});

function build(
  files: DocumentIndexFile[],
  readTitle: (
    sourcePath: string,
  ) => DocumentPageTitle | undefined = titleFromPath,
) {
  return buildDocumentIndex(files, SITE, readTitle);
}

function messages(files: DocumentIndexFile[]): string[] {
  return build(files).diagnostics.map(diagnostic => diagnostic.message);
}

/** The tree as nested labels, with the current page in brackets */
function outline(entry: DocumentTreeEntry): unknown {
  const label = entry.current ? `[${entry.title}]` : entry.title;
  return entry.children.length > 0
    ? { [label]: entry.children.map(outline) }
    : label;
}

beforeEach(() => {
  mock.module('./globals', () => ({
    globals: createGlobals({ cwd: () => SITE_ROOT }),
  }));
});

describe('buildDocumentIndex', () => {
  test('lists every page in depth-first order with previous and next', () => {
    const { index, diagnostics } = build([GUIDE]);
    expect(diagnostics).toEqual([]);

    const order = [
      'guide/index.md',
      'guide/install.md',
      'guide/topics/index.md',
      'guide/topics/deep.md',
      'guide/topics/wide.md',
      'guide/Foo.java',
    ];
    expect([...index.keys()]).toEqual(order.map(contentPath));
    order.forEach((relPath, position) => {
      const navigation = index.get(contentPath(relPath))!;
      expect(navigation.previous?.title).toBe(
        order[position - 1] && path.basename(order[position - 1]),
      );
      expect(navigation.next?.title).toBe(
        order[position + 1] && path.basename(order[position + 1]),
      );
      expect(navigation.indexFile).toBe('content/guide/index.yml');
    });
  });

  test('links to each page by its encoded output path', () => {
    const { index } = build([
      guideIndex({
        page: 'index.md',
        children: ['a b.md', 'Foo.java', 'Hello.java.md'],
      }),
    ]);
    const root = index.get(contentPath('guide/index.md'))!.tree;
    expect(root.href).toBe('/guide/index.html');
    expect(root.children.map(child => child.href)).toEqual([
      '/guide/a%20b.html',
      '/guide/Foo.java.html',
      '/guide/Hello.java.html',
    ]);
  });

  test('marks code pages', () => {
    const { index } = build([
      guideIndex({ page: 'index.md', children: ['Foo.java', 'Hello.java.md'] }),
    ]);
    const navigation = index.get(contentPath('guide/Foo.java'))!;
    expect(navigation.tree.isCodePage).toBe(false);
    expect(navigation.tree.children.map(child => child.isCodePage)).toEqual([
      true,
      false,
    ]);
    expect(navigation.previous?.isCodePage).toBe(false);
    expect(
      index.get(contentPath('guide/Hello.java.md'))!.previous?.isCodePage,
    ).toBe(true);
  });

  test('shows the root, the path to the page, siblings along it, and its children', () => {
    const { index } = build([GUIDE]);

    expect(outline(index.get(contentPath('guide/index.md'))!.tree)).toEqual({
      '[index.md]': ['install.md', 'index.md', 'Foo.java'],
    });
    expect(outline(index.get(contentPath('guide/install.md'))!.tree)).toEqual({
      'index.md': ['[install.md]', 'index.md', 'Foo.java'],
    });
    expect(
      outline(index.get(contentPath('guide/topics/deep.md'))!.tree),
    ).toEqual({
      'index.md': [
        'install.md',
        { 'index.md': ['[deep.md]', 'wide.md'] },
        'Foo.java',
      ],
    });

    const install = index.get(contentPath('guide/install.md'))!.tree;
    expect(install.children.map(child => child.isBranch)).toEqual([
      false,
      true,
      false,
    ]);
  });

  test('lists ancestors from the root down', () => {
    const { index } = build([GUIDE]);
    expect(index.get(contentPath('guide/index.md'))!.ancestors).toEqual([]);
    expect(
      index
        .get(contentPath('guide/topics/deep.md'))!
        .ancestors.map(link => link.href),
    ).toEqual(['/guide/index.html', '/guide/topics/index.html']);
  });

  test('drops links and their external link icons from title HTML', () => {
    const { index } = build([GUIDE], () => ({
      title: 'Linked',
      titleHtml:
        'The <a href="/x.html"><strong>bold</strong></a> and <a class="external" href="https://example.com">far <span class="external-link-tail"><span class="katex">x</span></span></a> page',
    }));
    expect(index.get(contentPath('guide/index.md'))!.tree.titleHtml).toBe(
      'The <strong>bold</strong> and far <span class="katex">x</span> page',
    );
  });

  test('makes title image URLs root-relative and drops srcset', () => {
    const { index } = build([GUIDE], sourcePath => ({
      title: 'Pictured',
      titleHtml: sourcePath.endsWith('deep.md')
        ? '<img src="logo%20a.png" srcset="logo.png 1x, ../big.png 2x"> <img src="../up.png"> <img src="/root.png"> <img src="https://example.com/x.png">'
        : 'Plain',
    }));
    const wide = index.get(contentPath('guide/topics/wide.md'))!;
    expect(wide.tree.children[1].children[0].titleHtml).toBe(
      '<img src="/guide/topics/logo%20a.png"> <img src="/guide/up.png"> <img src="/root.png"> <img src="https://example.com/x.png">',
    );
  });

  test('drops picture sources, keeping the fallback image', () => {
    const { index } = build([GUIDE], () => ({
      title: 'Pictured',
      titleHtml:
        '<picture><source srcset="dark.png" media="(prefers-color-scheme: dark)"><img src="light.png"></picture>',
    }));
    expect(index.get(contentPath('guide/install.md'))!.tree.titleHtml).toBe(
      '<picture><img src="/guide/light.png"></picture>',
    );
  });

  test('rejects a page without a title', () => {
    const { diagnostics } = build([GUIDE], sourcePath =>
      sourcePath.endsWith('install.md') ? undefined : titleFromPath(sourcePath),
    );
    expect(diagnostics.map(d => d.message)).toEqual([
      'content/guide/index.yml: "install.md" has no title; indexed pages need a "title" with text',
    ]);
  });

  test.each([
    '/install.md',
    '../index.md',
    './install.md',
    'topics/../install.md',
    'topics//deep.md',
    'topics\\deep.md',
    'install.md?x',
    'install.md#top',
  ])('rejects the source path %p', source => {
    expect(
      messages([guideIndex({ page: 'index.md', children: [source] })]),
    ).toEqual([
      `content/guide/index.yml: invalid source path "${source}" (use a relative path to a file in or below this directory)`,
    ]);
  });

  test('rejects sources that do not build pages', () => {
    for (const source of ['_partial.md', 'data.txt']) {
      expect(
        messages([guideIndex({ page: 'index.md', children: [source] })]),
      ).toEqual([
        `content/guide/index.yml: "${source}" does not build a page (partials, skipped pages, and copied files cannot be indexed)`,
      ]);
    }
  });

  test('rejects missing and repeated sources', () => {
    expect(
      messages([guideIndex({ page: 'index.md', children: ['missing.md'] })]),
    ).toEqual(['content/guide/index.yml: no such source: "missing.md"']);
    expect(
      messages([
        guideIndex({
          page: 'index.md',
          children: [
            'install.md',
            { page: 'topics/index.md', children: ['install.md'] },
          ],
        }),
      ]),
    ).toEqual([
      'content/guide/index.yml: "install.md" is listed more than once',
    ]);
  });

  test('rejects malformed files by schema', () => {
    for (const value of [
      'index.md',
      { page: 'index.md' },
      { page: 'index.md', children: [] },
      { page: 'index.md', children: ['install.md'], title: 'Guide' },
      { page: 'index.md', children: [{ page: 'install.md', children: [] }] },
    ]) {
      const [message] = messages([guideIndex(value)]);
      expect(message).toStartWith('content/guide/index.yml failed validation:');
    }
  });

  test('keeps separate files as separate trees', () => {
    const { index, diagnostics } = build([
      guideIndex({ page: 'index.md', children: ['install.md'] }),
      {
        filePath: contentPath('guide/topics/index.yml'),
        value: { page: 'index.md', children: ['deep.md'] },
      },
    ]);
    expect(diagnostics).toEqual([]);
    expect(index.get(contentPath('guide/install.md'))!.next).toBeUndefined();
    expect(
      index
        .get(contentPath('guide/topics/deep.md'))!
        .ancestors.map(a => a.href),
    ).toEqual(['/guide/topics/index.html']);
  });

  test('rejects a page listed by two files', () => {
    expect(
      messages([
        guideIndex({ page: 'index.md', children: ['topics/deep.md'] }),
        {
          filePath: contentPath('guide/topics/index.yml'),
          value: { page: 'index.md', children: ['deep.md'] },
        },
      ]),
    ).toEqual([
      'content/guide/topics/deep.md: listed in both content/guide/index.yml and content/guide/topics/index.yml; a page may appear in only one document index',
    ]);
  });

  test('rejects two index files in one directory', () => {
    expect(
      messages([
        GUIDE,
        { ...GUIDE, filePath: contentPath('guide/index.yaml') },
      ]),
    ).toEqual([
      'content/guide/index.yaml, content/guide/index.yml: keep only one document index per directory',
    ]);
  });

  test('reports problems in other files beside two index files in one directory', () => {
    expect(
      messages([
        GUIDE,
        { ...GUIDE, filePath: contentPath('guide/index.yaml') },
        {
          filePath: contentPath('guide/topics/index.yml'),
          value: { page: 'index.md', children: ['gone.md'] },
        },
      ]),
    ).toEqual([
      'content/guide/index.yaml, content/guide/index.yml: keep only one document index per directory',
      'content/guide/topics/index.yml: no such source: "gone.md"',
    ]);
  });

  test('reports every broken file', () => {
    expect(
      messages([
        guideIndex({ page: 'index.md', children: ['missing.md'] }),
        {
          filePath: contentPath('guide/topics/index.yml'),
          value: { page: 'index.md', children: ['gone.md'] },
        },
      ]),
    ).toHaveLength(2);
  });
});

describe('getChangedDocumentPages', () => {
  test('finds pages whose navigation was added, removed, or changed', () => {
    const before = build([GUIDE]).index;
    const retitled = build([GUIDE], sourcePath =>
      sourcePath.endsWith('wide.md')
        ? { title: 'Wide', titleHtml: 'Wide' }
        : titleFromPath(sourcePath),
    ).index;
    // Shown in the trees of its parent, its siblings, and itself; next of deep.md
    expect(getChangedDocumentPages(before, retitled)).toEqual(
      new Set(
        [
          'guide/topics/index.md',
          'guide/topics/deep.md',
          'guide/topics/wide.md',
          'guide/Foo.java',
        ].map(contentPath),
      ),
    );
    expect(getChangedDocumentPages(before, before)).toEqual(new Set());
    expect(getChangedDocumentPages(before, new Map())).toEqual(
      new Set(before.keys()),
    );
  });
});
