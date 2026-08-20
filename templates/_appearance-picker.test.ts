import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import APPEARANCE_PICKER_TEMPLATE from './_appearance-picker.html' with { type: 'text' };

describe('_appearance-picker.html template', () => {
  test('renders initially unavailable accessible appearance pickers', () => {
    const html = _.template(APPEARANCE_PICKER_TEMPLATE)({
      site: { defaultFont: 'sans', defaultContrast: 'standard' },
    });

    expect(html).toContain('class="appearance-pickers"');
    expect(html).toContain('aria-label="Font style"');
    expect(html).toContain('aria-label="Contrast"');
    expect(html).toContain('aria-label="Use sans-serif fonts"');
    expect(html).toContain('aria-label="Use serif fonts"');
    expect(html).toContain('aria-label="Use standard contrast"');
    expect(html).toContain('aria-label="Use high contrast"');
    expect(html).toContain('data-font-preference-value="sans"');
    expect(html).toContain('data-font-preference-value="serif"');
    expect(html).toContain('data-contrast-preference-value="standard"');
    expect(html).toContain('data-contrast-preference-value="high"');
    expect(html).toContain(
      'class="material-symbol-icon material-symbol-icon-contrast-standard"',
    );
    expect(html).toContain(
      'class="material-symbol-icon material-symbol-icon-contrast-high"',
    );
    expect(html).not.toContain('contrast-preview');
    expect(html).toContain('data-pagefind-ignore');
    expect(html).not.toContain(' hidden');
    expect(html.match(/disabled/g)).toHaveLength(4);
  });

  test('renders configured defaults as the initially pressed options', () => {
    const html = _.template(APPEARANCE_PICKER_TEMPLATE)({
      site: { defaultFont: 'serif', defaultContrast: 'high' },
    });

    expect(html).toContain(
      'data-font-preference-value="sans" aria-label="Use sans-serif fonts" aria-pressed="false"',
    );
    expect(html).toContain(
      'data-font-preference-value="serif" aria-label="Use serif fonts" aria-pressed="true"',
    );
    expect(html).toContain(
      'data-contrast-preference-value="standard" aria-label="Use standard contrast" aria-pressed="false"',
    );
    expect(html).toContain(
      'data-contrast-preference-value="high" aria-label="Use high contrast" aria-pressed="true"',
    );
  });
});
