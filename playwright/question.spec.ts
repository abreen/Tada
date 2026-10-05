import { test, expect } from './test-fixtures';

test('keyboard navigation skips concealed answer links until the answer is revealed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/questions.html');
  const answer = page.getByRole('button', { name: 'Click to reveal answer' });
  await expect(answer).toHaveCount(1);
  const link = page.locator('.question-a-content a');

  await answer.focus();
  await page.keyboard.press('Tab');
  await expect(link).not.toBeFocused();
  await expect
    .poll(() =>
      page
        .locator('.question-a-body')
        .evaluate(element => element.contains(document.activeElement)),
    )
    .toBe(false);

  await answer.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.question-a-body')).not.toHaveAttribute(
    'role',
    'button',
  );
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'a link', exact: true }),
  ).toBeVisible();
});

test('answer links remain readable and usable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/questions.html');
    const link = page.getByRole('link', { name: 'a link', exact: true });
    await expect(link).toBeVisible();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/slides\.html$/);
  } finally {
    await context.close();
  }
});

for (const [option, destination, result] of [
  ['Correct linked option', 'markdown.html', 'Selected answer, correct'],
  ['Incorrect linked option', 'slides.html', 'Selected answer, incorrect'],
] as const) {
  test(`selecting ${option} reveals the result before following its link`, async ({
    page,
  }) => {
    await page.goto('/linked-questions.html');
    const link = page.getByRole('link', { name: option, exact: true });
    const answer = link.locator('..');
    await expect(answer).toHaveAttribute('role', 'button');
    await expect(link).toHaveAttribute('data-tada-page', '');
    await page.evaluate(destination => {
      const originalFetch = window.fetch.bind(window);
      const root = document.documentElement;
      root.dataset.linkedQuestionRequests = '0';
      window.fetch = (...args) => {
        if (String(args[0]).endsWith(`/${destination}`)) {
          root.dataset.linkedQuestionRequests = String(
            Number(root.dataset.linkedQuestionRequests) + 1,
          );
        }
        return originalFetch(...args);
      };
    }, destination);

    await link.click();
    // Observe navigation initiation, even if its response has not arrived yet.
    await expect(page.locator('html')).toHaveAttribute(
      'data-linked-question-requests',
      '0',
    );
    await expect(page).toHaveURL(/\/linked-questions\.html$/);
    await expect(answer).toHaveAttribute('data-selected', '');
    await expect(answer).toContainText(result);

    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`/${destination.replace('.', '\\.')}$`),
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-linked-question-requests',
      '1',
    );
  });
}

test('linked answer keyboard selection stays on the question until a second activation', async ({
  page,
}) => {
  await page.goto('/linked-questions.html');
  const link = page.getByRole('link', {
    name: 'Correct linked option',
    exact: true,
  });
  const answer = link.locator('..');
  await expect(answer).toHaveAttribute('role', 'button');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/linked-questions\.html$/);
  await expect(answer).toHaveAttribute('data-selected', '');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/markdown\.html$/);
});

test('linked options navigate normally without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/linked-questions.html');
    await page
      .getByRole('link', { name: 'Correct linked option', exact: true })
      .click();
    await expect(page).toHaveURL(/\/markdown\.html$/);
  } finally {
    await context.close();
  }
});

test('question prompt links still navigate before an option is selected', async ({
  page,
}) => {
  await page.goto('/linked-questions.html');
  await expect(
    page.locator('.question-multiple-choice-option').first(),
  ).toHaveAttribute('role', 'button');
  await page.getByRole('link', { name: 'Question help', exact: true }).click();
  await expect(page).toHaveURL(/\/index\.html$/);
});

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
