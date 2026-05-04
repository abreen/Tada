import { getElement, applyBasePath } from '../util';
import { getPdfPageNumber, groupPdfResults } from './pdf-utils';
import type { Result } from './pdf-utils';
import {
  getResponseValidators,
  hasResponseValidatorsChanged,
  type ResponseValidators,
} from '../validators';
import { globals } from '../globals';

interface PagefindSubResult {
  title?: string;
  url: string;
  excerpt?: string;
}

interface PagefindResult {
  meta?: {
    title?: string;
    title_html?: string;
    page?: string;
    template?: string;
  };
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

type SearchState = Pick<State, 'results' | 'totalResults'> | null;

async function doSearch(query: string, window: Window): Promise<SearchState> {
  if (pagefind == null) {
    return null;
  }

  if (!query) {
    return { results: [], totalResults: 0 };
  }

  const search = await pagefind.search(query);
  const data = await Promise.all(search.results.map(r => r.data()));

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
      titleHtml: d.meta?.title_html ?? null,
      url: d.url,
      excerpt: d.excerpt ?? '',
      score: d.score ?? 0,
      subResults,
      pageNumber: getPdfPageNumber(d.url, d.meta?.page),
      template: d.meta?.template ?? null,
    };
  });

  const grouped = groupPdfResults(results);
  return { totalResults: grouped.length, results: grouped };
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
  loading = false,
) {
  const doc = resultsContainer.ownerDocument;

  if (state.showResults) {
    resultsContainer.removeAttribute('inert');
  }

  let resultsDiv = resultsContainer.querySelector(
    '.results',
  ) as HTMLElement | null;
  if (!resultsDiv) {
    resultsDiv = doc.createElement('div');
    resultsDiv.className = 'results';
    resultsContainer.appendChild(resultsDiv);
  }

  const ol = doc.createElement('ol');
  ol.id = `${input.name}-results`;
  ol.role = 'listbox';
  ol.tabIndex = -1;
  ol.setAttribute('aria-label', 'Search results');

  const totalVisible = state.results.length;

  state.results.forEach((result, i) => {
    const a = doc.createElement('a');
    a.id = `result-${i}`;
    a.className = 'result';
    a.href = result.url;
    a.tabIndex = 0;

    const titleEl = doc.createElement('div');
    titleEl.id = `title-${i}`;
    titleEl.className = 'title';
    if (result.template === 'code') {
      titleEl.classList.add('code-page');
    }
    if (result.titleHtml) {
      titleEl.innerHTML = result.titleHtml;
    } else {
      titleEl.textContent = result.title;
    }
    a.appendChild(titleEl);

    const excerpt = doc.createElement('div');
    excerpt.className = 'excerpt';
    excerpt.innerHTML = result.excerpt;
    a.appendChild(excerpt);

    const li = doc.createElement('li');
    li.id = `option-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-setsize', String(totalVisible));
    li.setAttribute('aria-posinset', String(i + 1));
    li.setAttribute('aria-labelledby', `title-${i}`);
    li.appendChild(a);

    const subsToShow = result.subResults;
    if (subsToShow.length > 0) {
      const subList = doc.createElement('ul');
      subList.className = 'sub-results';
      for (const sub of subsToShow) {
        const subA = doc.createElement('a');
        subA.href = sub.url;
        subA.className = 'sub-result';

        const subTitle = doc.createElement('div');
        subTitle.className = 'title';
        if (result.template === 'code') {
          subTitle.classList.add('code-page');
          const code = doc.createElement('code');
          code.textContent = sub.title;
          subTitle.appendChild(code);
        } else {
          subTitle.textContent = sub.title;
        }
        subA.appendChild(subTitle);

        if (sub.excerpt) {
          const subExcerpt = doc.createElement('div');
          subExcerpt.className = 'excerpt';
          subExcerpt.innerHTML = sub.excerpt;
          subA.appendChild(subExcerpt);
        }

        const subLi = doc.createElement('li');
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
    infoSpan = doc.createElement('span');
    infoSpan.className = 'results-info';

    const hint = doc.createElement('span');
    hint.className = 'search-hint';
    const kbd1 = doc.createElement('kbd');
    kbd1.textContent = '/';
    hint.append('Press\u00a0', kbd1, '\u00a0to search');
    infoSpan.appendChild(hint);

    resultsDiv.insertBefore(infoSpan, resultsDiv.firstChild);
  }

  let countSpan = infoSpan.querySelector(
    '.results-count',
  ) as HTMLSpanElement | null;
  if (!countSpan) {
    countSpan = doc.createElement('span');
    countSpan.className = 'results-count';
    infoSpan.insertBefore(countSpan, infoSpan.firstChild);
  }
  if (loading) {
    countSpan.textContent = 'Loading\u2026';
    infoSpan.classList.add('loading');
  } else {
    infoSpan.classList.remove('loading');
    const n = state.totalResults;
    if (n === 0) {
      countSpan.textContent = 'No results';
    } else if (n === 1) {
      countSpan.textContent = 'One result';
    } else {
      countSpan.textContent = `${n} results`;
    }
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
  const { document } = window;
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

  let entryValidators: ResponseValidators = { etag: null, lastModified: null };
  let lastIndexCheck = 0;
  let indexCheckInFlight = false;
  let pagefindLoadPromise: Promise<void> | null = null;

  async function loadPagefind() {
    if (pagefind) {
      return;
    }

    pagefindLoadPromise ??= (async () => {
      const loadedPagefind = (await globals.importModule(
        applyBasePath('/pagefind/pagefind.js'),
      )) as Pagefind;

      await loadedPagefind.init();
      pagefind = loadedPagefind;

      const res = await globals.fetch(
        applyBasePath('/pagefind/pagefind-entry.json'),
        { cache: 'no-cache' },
      );

      if (res.ok) {
        entryValidators = getResponseValidators(res);
      }
    })();

    try {
      await pagefindLoadPromise;
    } finally {
      pagefindLoadPromise = null;
    }
  }

  async function checkForIndexUpdate() {
    if (indexCheckInFlight || globals.now() - lastIndexCheck < 3000) {
      return;
    }
    lastIndexCheck = globals.now();
    indexCheckInFlight = true;
    try {
      const res = await globals.fetch(
        applyBasePath('/pagefind/pagefind-entry.json'),
        { method: 'HEAD', cache: 'no-cache' },
      );
      if (!res.ok) {
        return;
      }
      const newValidators = getResponseValidators(res);
      if (hasResponseValidatorsChanged(entryValidators, newValidators)) {
        invalidateUpdates();
        pagefind = null;
        pagefindLoadPromise = null;
        await loadPagefind();
        const updateId = ++latestUpdateId;
        await update(updateId);
      }
    } catch {
      // best-effort
    } finally {
      indexCheckInFlight = false;
    }
  }

  const state: State = {
    value: '',
    showResults: false,
    results: [],
    totalResults: 0,
  };

  let latestUpdateId = 0;

  async function update(updateId: number) {
    if (state.showResults) {
      render(input!, resultsContainer, state, true);
    }
    const query = state.value;
    const nextState = await doSearch(query, window);
    if (updateId !== latestUpdateId) {
      return;
    }
    if (!nextState) {
      return;
    }
    state.results = nextState.results;
    state.totalResults = nextState.totalResults;
    if (!state.showResults) {
      return;
    }
    render(input!, resultsContainer, state, false);
  }

  function queueUpdate() {
    const updateId = ++latestUpdateId;
    update(updateId).catch(() => {});
  }

  function invalidateUpdates() {
    latestUpdateId += 1;
  }

  loadPagefind()
    .then(() => {
      if (state.showResults) {
        queueUpdate();
      }
    })
    .catch(err => {
      console.log(`failed to load Pagefind: ${err}`);
      if (state.showResults) {
        render(input!, resultsContainer, state, false);
      }
    });

  function hide() {
    if (!state.showResults) {
      return;
    }
    state.showResults = false;
    render(input!, resultsContainer, state);
  }

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    if (value === state.value) {
      return;
    }
    state.value = value;
    if (value.length === 0) {
      invalidateUpdates();
      hide();
      state.results = [];
      state.totalResults = 0;
      return;
    }
    state.showResults = true;
    queueUpdate();
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
      queueUpdate();
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
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
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
