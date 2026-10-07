type HeadingLevel = '1' | '2' | '3' | '4' | '5' | '6';
type AlertType = 'warning' | 'note';

export type Alert = { type: AlertType; title: string };
export type Heading = { level: HeadingLevel; innerHtml: string; id: string };

const HEADINGS = '.body h1, .body h2, .body h3, .body h4, .body h5, .body h6';

function isNestedBlock(el: Element): boolean {
  return el.parentElement?.closest('.alert, .question') != null;
}

// Like the build-time TOC, nothing inside a <details> is listed, and alerts are
// only listed outside of another alert or question. Headings are listed at any
// other depth.
export function getHeadingsAndAlerts(
  parent: ParentNode,
): (HTMLHeadingElement | HTMLDivElement)[] {
  return Array.from(
    parent.querySelectorAll<HTMLHeadingElement | HTMLDivElement>(
      `${HEADINGS}, .body div.alert`,
    ),
  ).filter(
    el =>
      el.closest('details') == null &&
      (!el.matches('div.alert') || !isNestedBlock(el)),
  );
}

export function getHighlightIndexes(items: (Heading | Alert)[]) {
  const indexes: (number | null)[] = [];
  let currentHeadingIndex: number | null = null;
  let tocIndex = 0;

  items.forEach(item => {
    if ('level' in item) {
      currentHeadingIndex = tocIndex;
    }

    indexes.push(currentHeadingIndex ?? tocIndex);
    tocIndex++;
  });

  return indexes;
}

export function headingToTableItem(el: HTMLHeadingElement): Heading {
  const level = el.tagName[1] as HeadingLevel;

  const subtitle = el.querySelector('.heading-subtitle');
  const subtitleText = subtitle?.textContent || '';
  let mainText = el.textContent || '';

  if (mainText.length > 0 && subtitleText.length > 0) {
    mainText = mainText.replace(subtitleText, '').trim();
    return {
      level,
      id: el.id,
      innerHtml: `${mainText}: <span class="heading-subtitle">${subtitleText}</span>`,
    };
  }
  return { level, id: el.id, innerHtml: el.innerHTML };
}

export function alertToTableItem(el: HTMLElement): Alert | null {
  const classes = el.className
    .split(' ')
    .map(cl => cl.trim())
    .filter(cl => cl != 'alert');

  const firstClass = classes[0];
  if (firstClass === 'warning' || firstClass === 'note') {
    let title = el.querySelector('.title')?.innerHTML;
    if (!title) {
      if (firstClass === 'warning') {
        title = 'Warning';
      } else {
        title = 'Note';
      }
    }

    return { type: firstClass, title };
  }

  return null;
}

export function switchCurrent(
  oldCurrent: HTMLElement | null,
  newCurrent: HTMLElement,
) {
  if (oldCurrent) {
    oldCurrent.classList.remove('current');
  }
  newCurrent.classList.add('current');
}
