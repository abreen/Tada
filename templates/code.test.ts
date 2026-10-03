import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import { compileTemplate } from '../build/lodash-template';
import DOWNLOAD_TEMPLATE from './_download.html' with { type: 'text' };
import LITERATE_TEMPLATE from './literate.html' with { type: 'text' };
import CODE_TEMPLATE from './code.html' with { type: 'text' };

describe('code.html template', () => {
  test('marks the semantic page heading as a compact file title', () => {
    const html = _.template(CODE_TEMPLATE)({
      content: '',
      page: { titleHtml: '<code>demo.py</code>', tocHtml: '', tocItems: [] },
      render: () => '',
    });

    expect(html).toContain('<h1 class="file-title" data-pagefind-weight="10"');
    expect(html).toContain('<code>demo.py</code></h1>');
  });

  test('escapes code search entries', () => {
    const html = compileTemplate(CODE_TEMPLATE)({
      content: '',
      page: {
        titleHtml: '<code>Box.java</code>',
        tocHtml: '',
        tocItems: [
          { line: 3, name: 'of(List<T>)', label: 'Method & "factory"' },
        ],
      },
      render: () => '',
    });

    expect(html).toContain('<h2 id="L3">of(List&lt;T&gt;)</h2>');
    expect(html).toContain(
      '<p>Method &amp; &quot;factory&quot; defined at line 3.</p>',
    );
  });

  test('escapes download names in code and literate templates', () => {
    const page = {
      codeFilePath: '/a%26b.java',
      downloadName: 'a&"b".java',
      titleHtml: 'A',
    };
    const download = compileTemplate(DOWNLOAD_TEMPLATE)({ page });
    const literate = compileTemplate(LITERATE_TEMPLATE)({
      content: '',
      page,
      render: () => '',
    });

    expect(download).toContain('download="a&amp;&quot;b&quot;.java"');
    expect(literate).toContain('<code>a&amp;&quot;b&quot;.java</code>');
  });
});
