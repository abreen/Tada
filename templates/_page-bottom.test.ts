import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import { JSDOM } from 'jsdom';
import PAGE_BOTTOM_TEMPLATE from './_page-bottom.html' with { type: 'text' };
import FOOTER_TEMPLATE from './_footer.html' with { type: 'text' };
import PICKERS_TEMPLATE from './_appearance-picker.html' with { type: 'text' };

const partials: Record<string, string> = {
  '_footer.html': FOOTER_TEMPLATE,
  '_appearance-picker.html': PICKERS_TEMPLATE,
};

describe('_page-bottom.html template', () => {
  for (const footer of [false, true]) {
    for (const pickers of [false, true]) {
      test(`footer ${footer}, pickers ${pickers}`, () => {
        const data = {
          site: {
            defaultFont: 'sans',
            defaultContrast: 'standard',
            features: { footer, pickers },
          },
          tadaVersion: '1.0.0',
          render: (name: string): string => _.template(partials[name])(data),
        };
        const html = _.template(PAGE_BOTTOM_TEMPLATE)(data);
        const document = new JSDOM(html).window.document;
        expect(document.querySelectorAll('.page-bottom')).toHaveLength(
          footer || pickers ? 1 : 0,
        );
        expect(document.querySelectorAll('.page-bottom > footer')).toHaveLength(
          footer ? 1 : 0,
        );
        expect(
          document.querySelectorAll('.page-bottom > .appearance-pickers'),
        ).toHaveLength(pickers ? 1 : 0);
        if (footer && pickers) {
          expect(
            document.querySelector('footer')?.nextElementSibling?.className,
          ).toBe('appearance-pickers');
        }
        if (!footer && !pickers) {
          expect(html.trim()).toBe('');
        }
      });
    }
  }
});
