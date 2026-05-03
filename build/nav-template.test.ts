import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import { classNames } from './template-globals';

const NAV_TEMPLATE = `<nav>
<% config('nav').forEach(function(section) { %>
  <div>
    <p><%= section.title %></p>
    <ul>
      <% section.links.forEach(function(link) { %>
        <li>
          <a
            class="<%= cx({disabled: link.disabled, external: link.external}) %>"
            <% if (!link.disabled) { %>href="<%= link.internal || link.external %>"<% } %>
            <% if (link.external) { %>target="_blank" rel="noopener noreferrer"<% } %>
          >
            <%= link.text %></a>
        </li>
      <% }) %>
    </ul>
  </div>
<% }) %>
</nav>`;

function renderNav(navData: unknown[]): string {
  return _.template(NAV_TEMPLATE)({ config: () => navData, cx: classNames });
}

describe('_nav.html template', () => {
  test('external links have target="_blank"', () => {
    const navData = [
      {
        title: 'Links',
        links: [{ text: 'Outside', external: 'https://example.com' }],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('class="external"');
  });

  test('internal links do not have target="_blank"', () => {
    const navData = [
      { title: 'Links', links: [{ text: 'Home', internal: '/index.html' }] },
    ];

    const html = renderNav(navData);
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="/index.html"');
  });

  test('disabled external links still have target="_blank"', () => {
    const navData = [
      {
        title: 'Links',
        links: [
          { text: 'Soon', external: 'https://example.com', disabled: true },
        ],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('href=');
    expect(html).toContain('disabled');
    expect(html).toContain('external');
  });
});
