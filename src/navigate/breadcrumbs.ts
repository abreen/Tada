interface BreadcrumbIdentity {
  label: string;
  url: string;
}

interface BreadcrumbItem extends BreadcrumbIdentity {
  element: HTMLElement;
}

export function breadcrumbPageKey(href: string, pageUrl: string): string {
  const url = new URL(href, pageUrl);
  // Fragments identify positions on the same page; query strings can identify
  // different content. URL serialization also resolves relative paths/spaces.
  return url.origin + url.pathname + url.search;
}

export function sharedBreadcrumbCount(
  oldItems: readonly BreadcrumbIdentity[],
  newItems: readonly BreadcrumbIdentity[],
): number {
  let count = 0;
  while (
    count < Math.min(oldItems.length, newItems.length) &&
    oldItems[count].url === newItems[count].url &&
    oldItems[count].label === newItems[count].label
  ) {
    count++;
  }
  return count;
}

export function getBreadcrumbItems(
  document: Document,
  pageUrl: string,
): BreadcrumbItem[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('nav.breadcrumbs ol > li'),
  ).flatMap(element => {
    const text = element.querySelector('a, [aria-current="page"]');
    if (!text) {
      return [];
    }
    const href = text.getAttribute('href') ?? pageUrl;
    return [
      {
        element,
        label: (text.textContent ?? '').trim().replace(/\s+/g, ' '),
        url: breadcrumbPageKey(href, pageUrl),
      },
    ];
  });
}

export function setBreadcrumbTransitionNames(
  document: Document,
  pageUrl: string,
  sharedCount: number,
  side: 'enter' | 'leave',
): void {
  const breadcrumb = document.querySelector<HTMLElement>('nav.breadcrumbs');
  if (!breadcrumb) {
    return;
  }
  getBreadcrumbItems(document, pageUrl).forEach((item, index) => {
    const kind = index < sharedCount ? 'shared' : side;
    item.element.style.viewTransitionName = `page-breadcrumb-${kind}-${index}`;
  });
}

export function prepareBreadcrumbTransitionStyles(
  document: Document,
  oldCount: number,
  newCount: number,
  sharedCount: number,
): void {
  if (!oldCount && !newCount) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute('data-breadcrumb-transition-styles', '');
  const rules: string[] = [];
  const duration = 'var(--page-transition-duration)';
  for (let index = 0; index < sharedCount; index++) {
    const name = `page-breadcrumb-shared-${index}`;
    rules.push(`
      ::view-transition-group(${name}) {
        animation-duration: ${duration};
        animation-timing-function: var(--page-transition-movement-easing);
      }
      ::view-transition-old(${name}), ::view-transition-new(${name}) {
        mix-blend-mode: normal;
        animation: none;
      }
      ::view-transition-old(${name}) { display: none; }
      ::view-transition-old(${name}):only-child {
        display: block;
        animation: page-fade-out ${duration} ease-in both;
      }
      ::view-transition-new(${name}):only-child {
        animation: page-fade-in ${duration} ease-out both;
      }
    `);
  }
  for (let index = sharedCount; index < oldCount; index++) {
    rules.push(`::view-transition-old(page-breadcrumb-leave-${index}) {
      mix-blend-mode: normal;
      animation: page-fade-out ${duration} ease-in both;
    }`);
  }
  for (let index = sharedCount; index < newCount; index++) {
    rules.push(`::view-transition-new(page-breadcrumb-enter-${index}) {
      mix-blend-mode: normal;
      animation: page-fade-in ${duration} ease-out both;
    }`);
  }
  // Exact names keep these rules compatible with the bundled CSS parser, which
  // does not yet accept view-transition-class selectors. Names use indices only.
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

export function cleanupBreadcrumbTransitionNames(document: Document): void {
  for (const element of document.querySelectorAll<HTMLElement>(
    'nav.breadcrumbs, nav.breadcrumbs li',
  )) {
    element.style.removeProperty('view-transition-name');
  }
  document.querySelector('[data-breadcrumb-transition-styles]')?.remove();
}
