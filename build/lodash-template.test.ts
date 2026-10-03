import { describe, expect, test } from 'bun:test';
import { compileTemplate } from './lodash-template';

describe('compileTemplate', () => {
  test('leaves ES template literal syntax as literal text', () => {
    const render = compileTemplate('echo ${name} and `${a + b}`');
    expect(render({})).toBe('echo ${name} and `${a + b}`');
  });

  test('interpolates <%= %> without escaping', () => {
    expect(compileTemplate('<%= value %>')({ value: '<b>&</b>' })).toBe(
      '<b>&</b>',
    );
  });

  test('escapes <%- %> output', () => {
    expect(compileTemplate('<%- value %>')({ value: '<b>"&"</b>' })).toBe(
      '&lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;',
    );
  });

  test('evaluates <% %> blocks', () => {
    const source = '<% for (const item of items) { %>[<%= item %>]<% } %>';
    expect(compileTemplate(source)({ items: ['a', 'b'] })).toBe('[a][b]');
  });

  test('mixes literal ${} text with template output', () => {
    expect(compileTemplate('${HOME} is <%= home %>')({ home: '/root' })).toBe(
      '${HOME} is /root',
    );
  });
});
