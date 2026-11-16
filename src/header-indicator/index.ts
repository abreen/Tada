/**
 * A short label and a circle icon button shown in the header's controls, to
 * the left of the search box. The containers are rendered at build time with
 * `role="status"`, so adding an indicator announces its label.
 */
export interface HeaderIndicator {
  element: HTMLSpanElement;
  button: HTMLButtonElement;
}

export function createHeaderIndicator(
  document: Document,
  options: { text: string; buttonLabel: string; icon: 'close' | 'refresh' },
): HeaderIndicator {
  const element = document.createElement('span');
  element.className = 'header-indicator';

  const text = document.createElement('span');
  text.className = 'header-indicator-text';
  text.textContent = options.text;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', options.buttonLabel);
  button.title = options.buttonLabel;

  const icon = document.createElement('span');
  icon.className = `mask-icon mask-icon-${options.icon}`;
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);

  element.append(text, button);
  return { element, button };
}
