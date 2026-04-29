export default (window: Window) => {
  const appendResultText = (option: HTMLElement, text: string) => {
    const result = window.document.createElement('span');
    result.className = 'visually-hidden question-multiple-choice-result';
    result.textContent = text;
    option.append(result);
  };

  const multipleChoiceBlocks = window.document.querySelectorAll<HTMLElement>(
    '.question-multiple-choice',
  );
  multipleChoiceBlocks.forEach(block => {
    const options = Array.from(
      block.querySelectorAll<HTMLElement>('.question-multiple-choice-option'),
    );
    options.forEach(option => {
      option.setAttribute('role', 'button');
      option.setAttribute('tabindex', '0');
    });

    const reveal = (selected: HTMLElement) => {
      block.setAttribute('data-revealed', '');
      selected.setAttribute('data-selected', '');
      options.forEach(option => {
        option.removeAttribute('role');
        option.removeAttribute('tabindex');
        if (option.hasAttribute('data-correct')) {
          appendResultText(
            option,
            option === selected ? 'Selected answer, correct' : 'Correct answer',
          );
        } else if (option === selected) {
          appendResultText(option, 'Selected answer, incorrect');
        }
      });
    };

    options.forEach(option => {
      option.addEventListener('click', (e: MouseEvent) => {
        if (block.hasAttribute('data-revealed')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        reveal(option);
      });
      option.addEventListener('keydown', (e: KeyboardEvent) => {
        if (block.hasAttribute('data-revealed')) {
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          reveal(option);
        }
      });
    });
  });

  const bodies =
    window.document.querySelectorAll<HTMLElement>('.question-a-body');
  bodies.forEach(el => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Click to reveal answer');

    const reveal = () => {
      el.setAttribute('data-revealed', '');
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      el.removeAttribute('aria-label');
    };

    el.addEventListener('click', (e: MouseEvent) => {
      if (el.hasAttribute('data-revealed')) {
        return;
      }

      e.stopPropagation();
      reveal();
    });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (el.hasAttribute('data-revealed')) {
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        reveal();
      }
    });
  });
  return () => {};
};
