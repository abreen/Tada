import { expect, test } from './test-fixtures';

test('the latest trace navigation wins when an older chunk loads late', async ({
  page,
}) => {
  const entry = (step: number) => ({
    file: 'slides-reset-trace.java',
    line: step === 1 ? 1 : 2,
    output: [{ stream: 'stdout', text: `output ${step}` }],
    svg: `<svg class="trace-memory" width="640" height="480"><text x="20" y="40">step ${step}</text></svg>`,
  });
  await page.route('**/trace-reset/manifest.json', route =>
    route.fulfill({
      json: {
        totalSteps: 3,
        chunkSize: 2,
        primaryFile: 'slides-reset-trace.java',
        sources: [],
      },
    }),
  );
  await page.route('**/trace-reset/chunk-0.json', route =>
    route.fulfill({ json: [entry(1), entry(2)] }),
  );
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const pending = new Promise<void>(resolve => {
    requested = resolve;
  });
  await page.route('**/trace-reset/chunk-1.json', async route => {
    requested();
    await gate;
    await route.fulfill({ json: [entry(3)] });
  });
  await page.goto('/slides-reset.html');
  const widget = page.locator('.trace-widget');
  const counter = widget.locator('.trace-step-counter');
  const button = (name: string) =>
    widget.getByRole('button', { name, exact: true });
  await expect(counter).toHaveText('1/3');
  await button('Next').click();
  await expect(counter).toHaveText('2/3');
  await button('Last').click();
  await pending;
  await button('First').click();
  await expect(counter).toHaveText('1/3');
  const response = page.waitForResponse('**/trace-reset/chunk-1.json');
  release();
  await (await response).finished();
  // Let the response's JSON parsing and render complete before checking stability.
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(counter).toHaveText('1/3');
  await expect(widget.locator('.trace-diagram')).toHaveText('step 1');
  await expect(widget.locator('.trace-output')).toHaveText('output 1');
  await expect(
    widget.locator('.code-row.trace-line-active .line-number'),
  ).toHaveAttribute('data-line', '1');
  await expect(button('First')).toBeDisabled();
  await expect(button('Next')).toBeEnabled();

  await button('Last').click();
  await expect(counter).toHaveText('3/3');
  await expect(widget.locator('.trace-diagram')).toHaveText('step 3');
  await button('Prev').click();
  await expect(counter).toHaveText('2/3');
  await button('First').click();
  await expect(counter).toHaveText('1/3');
});
