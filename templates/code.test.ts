import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
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
});
