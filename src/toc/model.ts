export type HeadingLevel = '1' | '2' | '3' | '4' | '5' | '6';
export type AlertType = 'warning' | 'note';

export type Alert = { type: AlertType; title: string };
export type Heading = { level: HeadingLevel; innerHtml: string; id: string };
export type Dinkus = { type: 'dinkus' };

export function getHighlightIndexes(items: (Heading | Alert | Dinkus)[]) {
  const indexes: (number | null)[] = [];
  let currentHeadingIndex: number | null = null;
  let tocIndex = 0;

  items.forEach(item => {
    if (!('level' in item) && item.type === 'dinkus') {
      return;
    }

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
