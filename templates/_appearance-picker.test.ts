import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import APPEARANCE_PICKER_TEMPLATE from './_appearance-picker.html' with { type: 'text' };

describe('_appearance-picker.html template', () => {
  test('renders initially unavailable accessible appearance pickers', () => {
    const html = _.template(APPEARANCE_PICKER_TEMPLATE)({
      site: {
        defaultFont: 'sans',
        defaultContrast: 'standard',
        features: { pickers: true },
      },
    });

    expect(html).toContain('class="appearance-pickers"');
    expect(html).toContain('aria-label="Use serif fonts"');
    expect(html).toContain('aria-label="Use high contrast"');
    expect(html).toContain('title="Use serif fonts"');
    expect(html).toContain('title="Use high contrast"');
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('data-font-preference-value="sans"');
    expect(html).toContain('data-font-preference-value="serif"');
    expect(html).toContain('data-contrast-preference-value="standard"');
    expect(html).toContain('data-contrast-preference-value="high"');
    expect(html).toContain('material-symbol-icon-contrast-standard');
    expect(html).toContain('material-symbol-icon-contrast-high');
    expect(html).not.toContain('contrast-preview');
    expect(html).toContain('data-pagefind-ignore');
    expect(html).not.toContain(' hidden');
    expect(html.match(/disabled/g)).toHaveLength(2);
  });

  test('renders configured defaults as the initial switch states', () => {
    const html = _.template(APPEARANCE_PICKER_TEMPLATE)({
      site: {
        defaultFont: 'serif',
        defaultContrast: 'high',
        features: { pickers: true },
      },
    });

    expect(html).toContain(
      'data-font-preference-switch aria-label="Use serif fonts" aria-checked="true"',
    );
    expect(html).toContain('title="Use sans-serif fonts"');
    expect(html).toContain(
      'data-contrast-preference-switch aria-label="Use high contrast" aria-checked="true"',
    );
    expect(html).toContain('title="Use standard contrast"');
  });

  test('renders nothing when appearance pickers are disabled', () => {
    const html = _.template(APPEARANCE_PICKER_TEMPLATE)({
      site: {
        defaultFont: 'sans',
        defaultContrast: 'standard',
        features: { pickers: false },
      },
    });

    expect(html.trim()).toBe('');
    expect(html).not.toContain('class="appearance-pickers"');
  });
});
