import { test, expect } from './test-fixtures';

for (const javaScriptEnabled of [true, false]) {
  test(`cross-origin embedded code downloads with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      const page = await context.newPage();
      await page.goto('http://localhost:8082/custom/index.html');
      await page.locator('main.body').evaluate(main => {
        const frame = document.createElement('iframe');
        frame.title = 'Embedded source';
        frame.src = 'http://localhost:8081/lectures/01/Rectangle.java.html';
        main.prepend(frame);
      });
      const frame = page.frameLocator('iframe[title="Embedded source"]');
      const downloadLink = frame.getByRole('link', {
        name: 'Download',
        exact: true,
      });
      await expect(downloadLink).toBeVisible();
      if (javaScriptEnabled) {
        await expect(
          frame.locator('[data-font-preference-switch]'),
        ).toBeEnabled();
        await expect
          .poll(() =>
            frame
              .locator('.code-scrollbar > div')
              .evaluate(element => element.style.width !== ''),
          )
          .toBe(true);
        await frame.locator('html').evaluate(element => {
          const view = element.ownerDocument.defaultView! as Window &
            typeof globalThis;
          if (typeof view.showSaveFilePicker !== 'function') {
            throw new Error(
              'The real browser save picker must be exposed for this regression',
            );
          }
          const picker = view.showSaveFilePicker.bind(view);
          view.showSaveFilePicker = async options => {
            try {
              return await picker(options);
            } catch (error) {
              const failure = error as Error;
              element.dataset.pickerErrorName = failure.name;
              element.dataset.pickerErrorMessage = failure.message;
              throw error;
            }
          };
        });
      }
      const downloadPromise = page
        .waitForEvent('download', { timeout: 3000 })
        .catch(() => null);
      await downloadLink.click();
      const download = await downloadPromise;
      console.log(
        'EMBEDDED_DOWNLOAD',
        JSON.stringify({
          javaScriptEnabled,
          pickerErrorName: await frame
            .locator('html')
            .getAttribute('data-picker-error-name'),
          pickerErrorMessage: await frame
            .locator('html')
            .getAttribute('data-picker-error-message'),
          downloaded: download !== null,
        }),
      );
      expect(download).not.toBeNull();
      if (!download) {
        return;
      }
      expect(download.suggestedFilename()).toBe('Rectangle.java');
      expect(await download.failure()).toBeNull();
      await expect(page).toHaveURL('http://localhost:8082/custom/index.html');
    } finally {
      await context.close();
    }
  });
}

for (const embedded of [false, true]) {
  for (const outcome of ['save', 'cancel'] as const) {
    test(`${embedded ? 'same-origin embedded' : 'top-level'} code preserves picker ${outcome} behavior`, async ({
      page,
    }) => {
      const downloads: string[] = [];
      page.on('download', download =>
        downloads.push(download.suggestedFilename()),
      );
      await page.addInitScript(result => {
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: async (options: { suggestedName: string }) => {
            const html = document.documentElement;
            html.dataset.pickerCalls = String(
              Number(html.dataset.pickerCalls ?? 0) + 1,
            );
            html.dataset.pickerFilename = options.suggestedName;
            if (result === 'cancel') {
              throw new DOMException('Cancelled by user', 'AbortError');
            }
            return {
              async createWritable() {
                return {
                  async write(blob: Blob) {
                    html.dataset.savedSource = await blob.text();
                  },
                  async close() {
                    html.dataset.savedClosed = 'true';
                  },
                };
              },
            };
          },
        });
      }, outcome);
      const sourceUrl = 'http://localhost:8081/lectures/01/Rectangle.java.html';
      let source;
      if (embedded) {
        await page.goto('/index.html');
        await page.locator('main.body').evaluate((main, url) => {
          const frame = document.createElement('iframe');
          frame.title = 'Embedded source';
          frame.src = url;
          main.prepend(frame);
        }, sourceUrl);
        source = page.frameLocator('iframe[title="Embedded source"]');
      } else {
        await page.goto(sourceUrl);
        source = page;
      }
      await expect
        .poll(() =>
          source
            .locator('.code-scrollbar > div')
            .evaluate(element => element.style.width !== ''),
        )
        .toBe(true);
      await source.getByRole('link', { name: 'Download', exact: true }).click();
      await expect(source.locator('html')).toHaveAttribute(
        'data-picker-calls',
        '1',
      );
      await expect(source.locator('html')).toHaveAttribute(
        'data-picker-filename',
        'Rectangle.java',
      );
      if (outcome === 'save') {
        await expect(source.locator('html')).toHaveAttribute(
          'data-saved-source',
          /class Rectangle/,
        );
        await expect(source.locator('html')).toHaveAttribute(
          'data-saved-closed',
          'true',
        );
      } else {
        await expect(source.locator('html')).not.toHaveAttribute(
          'data-saved-source',
        );
      }
      expect(downloads).toHaveLength(0);
      expect(
        await source
          .locator('html')
          .evaluate(element => element.ownerDocument.location.href),
      ).toBe(sourceUrl);
    });
  }
}
