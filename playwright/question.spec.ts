import { test, expect } from './test-fixtures';

test('reveals definitions and math in one opacity transition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/questions.html');
  const answer = page.locator('.question-a-body');
  await expect(answer).toHaveAttribute('role', 'button');
  await expect(answer.locator('.katex')).toHaveCount(1);
  const hiddenTogether = await answer.evaluate(element => {
    const definition = element.querySelector('dfn')!;
    const math = element.querySelector('.katex')!;
    let ancestor = definition.parentElement;
    while (ancestor && ancestor !== element) {
      if (
        ancestor.contains(math) &&
        getComputedStyle(ancestor).opacity === '0'
      ) {
        return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  });
  expect(hiddenTogether).toBe(true);

  await answer.click();
  const reveal = await answer.evaluate(element => {
    const content = element.querySelector('.question-a-content')!;
    const transitions = content.getAnimations({ subtree: true });
    for (const animation of transitions) {
      animation.pause();
      animation.currentTime = 125;
    }
    return {
      targets: transitions.map(
        animation => (animation.effect as KeyframeEffect).target === content,
      ),
      opacity: Number(getComputedStyle(content).opacity),
    };
  });
  expect(reveal.targets).toEqual([true]);
  expect(reveal.opacity).toBeGreaterThan(0);
  expect(reveal.opacity).toBeLessThan(1);
  await answer.evaluate(element => {
    element
      .getAnimations({ subtree: true })
      .forEach(animation => animation.finish());
  });
  await expect(answer).toHaveAttribute('data-revealed', '');
  await expect(answer.getByRole('link')).toBeVisible();
});

for (const mode of ['no JavaScript', 'print', 'reduced motion'] as const) {
  test(`answer is readable with ${mode}`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: mode !== 'no JavaScript',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('http://localhost:8081/questions.html');
    const answer = page.locator('.question-a-body');
    if (mode === 'print') {
      await page.emulateMedia({ media: 'print' });
    } else if (mode === 'reduced motion') {
      await expect(answer).toHaveAttribute('role', 'button');
      await answer.focus();
      await page.keyboard.press('Enter');
    }
    await expect(answer.locator('.question-a-content')).toHaveCSS(
      'opacity',
      '1',
    );
    expect(
      await answer.evaluate(
        element => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await context.close();
  });
}
