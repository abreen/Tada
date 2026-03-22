import { getElement, applyBasePath } from '../util';
import { getPdfPageNumber, groupPdfResults } from './pdf-utils';
import type { Result } from './pdf-utils';

const MAX_RESULTS = 24;

interface PagefindSubResult {
  title?: string;
  url: string;
  excerpt?: string;
}

interface PagefindResult {
  meta?: { title?: string; page?: string };
  url: string;
  excerpt?: string;
  score: number;
  sub_results?: PagefindSubResult[];
}

interface PagefindSearchResult {
  data(): Promise<PagefindResult>;
}

interface Pagefind {
  init(): Promise<void>;
  search(query: string): Promise<{ results: PagefindSearchResult[] }>;
}

let pagefind: Pagefind | null = null;

type SubResult = { title: string; url: string; excerpt: string };

type State = {
  value: string;
  showResults: boolean;
  results: Result[];
  totalResults: number;
};

async function doSearch(state: State) {
  if (pagefind == null) {
    return;
  }

  if (!state.value) {
    state.results = [];
    state.totalResults = 0;
    return;
  }

  const search = await pagefind.search(state.value);
  const slice = search.results.slice(0, MAX_RESULTS);
  const data = await Promise.all(slice.map(r => r.data()));

  const titlePostfix = __SITE_TITLE_POSTFIX__;
  const results: Result[] = data.map((d: PagefindResult) => {
    let title: string = d.meta?.title ?? d.url;
    if (titlePostfix && title.endsWith(titlePostfix)) {
      title = title.slice(0, -titlePostfix.length);
    }
    const subResults: SubResult[] = (d.sub_results ?? [])
      .filter((s: PagefindSubResult) => {
        try {
          return new URL(s.url, window.location.href).hash !== '';
        } catch {
          return s.url !== d.url;
        }
      })
      .map((s: PagefindSubResult) => ({
        title: s.title ?? '',
        url: s.url,
        excerpt: s.excerpt ?? '',
      }));
    return {
      title,
      url: d.url,
      excerpt: d.excerpt ?? '',
      score: d.score ?? 0,
      subResults,
      pageNumber: getPdfPageNumber(d.url, d.meta?.page),
    };
  });

  const grouped = groupPdfResults(results);
  state.totalResults = grouped.length;
  state.results = grouped;
}

function applyHighlight(
  resultsContainer: HTMLElement,
  focusedEl: HTMLElement | null,
) {
  const options = Array.from(
    resultsContainer.querySelectorAll('[role="option"]'),
  ) as HTMLElement[];
  options.forEach(opt => {
    const selected = focusedEl !== null && opt.contains(focusedEl);
    opt.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function render(
  input: HTMLInputElement,
  resultsContainer: HTMLElement,
  state: State,
) {
  if (state.showResults) {
    resultsContainer.removeAttribute('inert');
  }

  let resultsDiv = resultsContainer.querySelector(
    '.results',
  ) as HTMLElement | null;
  if (!resultsDiv) {
    resultsDiv = document.createElement('div');
    resultsDiv.className = 'results';
    resultsContainer.appendChild(resultsDiv);
  }

  const ol = document.createElement('ol');
  ol.id = `${input.name}-results`;
  ol.role = 'listbox';
  ol.tabIndex = -1;
  ol.setAttribute('aria-label', 'Search results');

  const totalVisible = Math.min(state.results.length, MAX_RESULTS);

  state.results.slice(0, MAX_RESULTS).forEach((result, i) => {
    const a = document.createElement('a');
    a.id = `result-${i}`;
    a.className = 'result';
    a.href = result.url;
    a.tabIndex = 0;

    const titleEl = document.createElement('div');
    titleEl.id = `title-${i}`;
    titleEl.className = 'title';
    titleEl.textContent = result.title;
    a.appendChild(titleEl);

    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    subtitle.innerText = result.url;
    a.appendChild(subtitle);

    const excerpt = document.createElement('div');
    excerpt.className = 'excerpt';
    excerpt.innerHTML = result.excerpt;
    a.appendChild(excerpt);

    const li = document.createElement('li');
    li.id = `option-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-setsize', String(totalVisible));
    li.setAttribute('aria-posinset', String(i + 1));
    li.setAttribute('aria-labelledby', `title-${i}`);
    li.appendChild(a);

    const subsToShow = result.subResults.slice(0, 5);
    if (subsToShow.length > 0) {
      const subList = document.createElement('ul');
      subList.className = 'sub-results';
      for (const sub of subsToShow) {
        const subA = document.createElement('a');
        subA.href = sub.url;
        subA.className = 'sub-result';

        const subTitle = document.createElement('div');
        subTitle.className = 'title';
        subTitle.textContent = sub.title;
        subA.appendChild(subTitle);

        if (sub.excerpt) {
          const subExcerpt = document.createElement('div');
          subExcerpt.className = 'excerpt';
          subExcerpt.innerHTML = sub.excerpt;
          subA.appendChild(subExcerpt);
        }

        const subLi = document.createElement('li');
        subLi.appendChild(subA);
        subList.appendChild(subLi);
      }
      li.appendChild(subList);
    }

    ol.appendChild(li);
  });

  resultsDiv.replaceChildren(ol);

  let infoSpan = resultsDiv.querySelector(
    '.results-info',
  ) as HTMLSpanElement | null;
  if (!infoSpan) {
    infoSpan = document.createElement('span');
    infoSpan.className = 'results-info';

    const hint = document.createElement('span');
    hint.className = 'search-hint';
    const kbd1 = document.createElement('kbd');
    kbd1.textContent = 'Ctrl';
    const kbd2 = document.createElement('kbd');
    kbd2.textContent = 'Space';
    hint.append(kbd1, '+', kbd2, '\u00a0to search');
    infoSpan.appendChild(hint);

    resultsDiv.insertBefore(infoSpan, resultsDiv.firstChild);
  }

  let countSpan = infoSpan.querySelector(
    '.results-count',
  ) as HTMLSpanElement | null;
  if (!countSpan) {
    countSpan = document.createElement('span');
    countSpan.className = 'results-count';
    infoSpan.insertBefore(countSpan, infoSpan.firstChild);
  }
  const n = state.totalResults;
  if (n === 0) {
    countSpan.textContent = 'No results';
  } else if (n === 1) {
    countSpan.textContent = 'One result';
  } else if (n <= MAX_RESULTS) {
    countSpan.textContent = `${n} results`;
  } else {
    countSpan.textContent = `Showing first ${MAX_RESULTS} results`;
  }

  if (state.showResults) {
    resultsContainer.classList.add('is-showing');
    resultsContainer.setAttribute('aria-hidden', 'false');
  } else {
    resultsContainer.classList.remove('is-showing');
    resultsContainer.setAttribute('aria-hidden', 'true');
    resultsContainer.setAttribute('inert', '');
  }

  input.setAttribute('aria-expanded', String(state.showResults));
  input.setAttribute('aria-controls', ol.id);
}

export default (window: Window) => {
  const input = document.querySelector(
    'input.quick-search',
  ) as HTMLInputElement | null;
  if (!input) {
    return;
  }

  const header = input.closest('header') as HTMLElement;
  const resultsContainer = getElement(header, '.results-container');
  const resultsDiv = getElement(resultsContainer, '.results');

  // Unhide (hidden via inline style in template to prevent FOUC)
  resultsDiv.style.display = '';

  let entryETag: string | null = null;
  let entryLastModified: string | null = null;
  let lastIndexCheck = 0;
  let indexCheckInFlight = false;

  async function loadPagefind() {
    if (pagefind) {
      return;
    }

    pagefind = (await import(
      applyBasePath('/pagefind/pagefind.js')
    )) as Pagefind;

    await pagefind.init();

    const res = await fetch(applyBasePath('/pagefind/pagefind-entry.json'), {
      cache: 'no-cache',
    });

    if (res.ok) {
      entryETag = res.headers.get('ETag');
      entryLastModified = res.headers.get('Last-Modified');
    }
  }

  async function checkForIndexUpdate() {
    if (indexCheckInFlight || Date.now() - lastIndexCheck < 3000) {
      return;
    }
    lastIndexCheck = Date.now();
    indexCheckInFlight = true;
    try {
      const res = await fetch(applyBasePath('/pagefind/pagefind-entry.json'), {
        method: 'HEAD',
        cache: 'no-cache',
      });
      if (!res.ok) {
        return;
      }
      const newETag = res.headers.get('ETag');
      const newLastModified = res.headers.get('Last-Modified');
      const changed =
        (newETag !== null && newETag !== entryETag) ||
        (newETag === null &&
          newLastModified !== null &&
          newLastModified !== entryLastModified);
      if (changed) {
        pagefind = null;
        await loadPagefind();
        await update();
      }
    } catch {
      // best-effort
    } finally {
      indexCheckInFlight = false;
    }
  }

  loadPagefind().catch(err => {
    console.log(`failed to load Pagefind: ${err}`);
  });

  const state: State = {
    value: '',
    showResults: false,
    results: [],
    totalResults: 0,
  };

  async function update() {
    await doSearch(state);
    render(input!, resultsContainer, state);
  }

  function hide() {
    state.showResults = false;
    render(input!, resultsContainer, state);
  }

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    if (value === state.value) {
      return;
    }
    state.value = value;
    state.showResults = true;
    update().catch(() => {});
  }

  function handleWindowPointerMove() {
    resultsContainer.classList.remove('is-typing');
  }

  let previousFocus: HTMLElement | null = null;

  function handleFocus(e: FocusEvent) {
    const previous = e.relatedTarget as HTMLElement | null;
    if (previous && !resultsContainer.contains(previous)) {
      previousFocus = previous;
    }
    checkForIndexUpdate().catch(() => {});
    if (!state.showResults) {
      state.showResults = true;
      update().catch(() => {});
    }
  }

  let pointerDownInResults = false;

  function handleBlur(e: FocusEvent) {
    if (!state.showResults) {
      return;
    }
    const related = e.relatedTarget as HTMLElement | null;
    if (related && resultsContainer.contains(related)) {
      return;
    }
    if (pointerDownInResults) {
      return;
    }
    hide();
  }

  function handlePointerDown() {
    pointerDownInResults = true;
  }

  function handleWindowPointerUp(e: PointerEvent) {
    if (!pointerDownInResults) {
      return;
    }
    // If released inside results, let the click handler hide instead
    if (resultsContainer.contains(e.target as Node)) {
      return;
    }
    pointerDownInResults = false;
    hide();
  }

  function handleResultClick() {
    pointerDownInResults = false;
    hide();
  }

  function handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.showResults) {
        hide();
      } else {
        previousFocus?.focus();
      }
      return;
    }

    if (!state.showResults) {
      return;
    }

    const links = Array.from(
      resultsContainer.querySelectorAll('a.result, a.sub-result'),
    ) as HTMLElement[];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[0]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // no-op: already at the top of the widget
    }
  }

  function handleResultsKeyDown(e: KeyboardEvent) {
    const links = Array.from(
      resultsContainer.querySelectorAll('a.result, a.sub-result'),
    ) as HTMLElement[];
    const focused = document.activeElement as HTMLElement;
    const idx = links.indexOf(focused);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < 0) {
        return;
      }
      links[(idx + 1) % links.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx < 0) {
        return;
      }
      if (idx === 0) {
        input!.focus();
      } else {
        links[idx - 1].focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
      input!.focus();
    }
  }

  function handleResultsFocusIn(e: FocusEvent) {
    applyHighlight(resultsContainer, e.target as HTMLElement);
  }

  function handleResultsFocusOut(e: FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && (resultsContainer.contains(related) || related === input)) {
      return;
    }
    applyHighlight(resultsContainer, null);
  }

  function handleWindowPointerDown(e: PointerEvent) {
    const target = e.target as Node;
    if (!input!.contains(target) && !resultsContainer.contains(target)) {
      hide();
    }
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    resultsContainer.classList.add('is-typing');
    if (e.key === ' ' && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      input!.focus();
    }
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('focus', handleFocus);
  input.addEventListener('blur', handleBlur);
  input.addEventListener('keydown', handleInputKeyDown);
  resultsContainer.addEventListener('pointerdown', handlePointerDown);
  resultsContainer.addEventListener('click', handleResultClick);
  resultsContainer.addEventListener('keydown', handleResultsKeyDown);
  resultsContainer.addEventListener('focusin', handleResultsFocusIn);
  resultsContainer.addEventListener('focusout', handleResultsFocusOut);
  window.addEventListener('pointerup', handleWindowPointerUp);
  window.addEventListener('pointerdown', handleWindowPointerDown);
  window.addEventListener('pointermove', handleWindowPointerMove);
  window.addEventListener('keydown', handleWindowKeyDown);

  return () => {
    window.removeEventListener('keydown', handleWindowKeyDown);
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerdown', handleWindowPointerDown);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    resultsContainer.removeEventListener('focusout', handleResultsFocusOut);
    resultsContainer.removeEventListener('focusin', handleResultsFocusIn);
    resultsContainer.removeEventListener('keydown', handleResultsKeyDown);
    resultsContainer.removeEventListener('click', handleResultClick);
    resultsContainer.removeEventListener('pointerdown', handlePointerDown);
    input!.removeEventListener('keydown', handleInputKeyDown);
    input!.removeEventListener('blur', handleBlur);
    input!.removeEventListener('focus', handleFocus);
    input!.removeEventListener('input', handleInput);
  };
};
