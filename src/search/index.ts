import { getElement, applyBasePath } from '../util';
import { on, remove } from '../global';

const MAX_RESULTS = 24;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pagefind: any = null;

type SubResult = { title: string; url: string; excerpt: string };
type Result = {
  title: string;
  url: string;
  excerpt: string;
  score: number;
  subResults: SubResult[];
  pageNumber: number | null;
};

type State = {
  value: string;
  showResults: boolean;
  results: Result[];
  totalResults: number;
  activeIndex: number;
};

function getPdfPageNumber(
  url: string,
  pageMeta: string | undefined,
): number | null {
  const fromMeta = Number.parseInt(pageMeta ?? '', 10);
  if (Number.isInteger(fromMeta) && fromMeta > 0) {
    return fromMeta;
  }
  const match = url.match(/#(?:.*&)?page=(\d+)\b/i);
  if (!match) return null;
  const fromUrl = Number.parseInt(match[1], 10);
  return Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : null;
}

function getPdfBaseUrl(url: string): string | null {
  const hashIndex = url.indexOf('#');
  const baseUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  return baseUrl.toLowerCase().endsWith('.pdf') ? baseUrl : null;
}

function groupPdfResults(results: Result[]): Result[] {
  const pdfGroups = new Map<string, Result[]>();
  const other: Result[] = [];

  for (const result of results) {
    const baseUrl = getPdfBaseUrl(result.url);
    if (!baseUrl || result.pageNumber == null) {
      other.push(result);
      continue;
    }
    if (!pdfGroups.has(baseUrl)) {
      pdfGroups.set(baseUrl, []);
    }
    pdfGroups.get(baseUrl)!.push(result);
  }

  const grouped: Result[] = [...other];

  pdfGroups.forEach((pages, baseUrl) => {
    const primary = pages
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score || (a.pageNumber ?? 0) - (b.pageNumber ?? 0),
      )[0];
    const subResults = pages
      .slice()
      .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0))
      .map(page => ({
        title: `Page ${page.pageNumber ?? '?'}`,
        url: page.url,
        excerpt: page.excerpt,
      }));

    grouped.push({
      title: primary.title,
      url: baseUrl,
      excerpt: primary.excerpt,
      score: primary.score,
      subResults,
      pageNumber: null,
    });
  });

  grouped.sort((a, b) => b.score - a.score);
  return grouped;
}

async function doSearch(state: State) {
  if (pagefind == null) return;

  if (!state.value) {
    state.results = [];
    state.totalResults = 0;
    state.activeIndex = -1;
    return;
  }

  const search = await pagefind.search(state.value);
  const slice = search.results.slice(0, MAX_RESULTS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await Promise.all(slice.map((r: any) => r.data()));

  const titlePostfix = window.siteVariables.titlePostfix ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Result[] = data.map((d: any) => {
    let title: string = d.meta?.title ?? d.url;
    if (titlePostfix && title.endsWith(titlePostfix)) {
      title = title.slice(0, -titlePostfix.length);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subResults: SubResult[] = (d.sub_results ?? [])
      .filter((s: any) => {
        try {
          return new URL(s.url, window.location.href).hash !== '';
        } catch {
          return s.url !== d.url;
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => ({
        title: s.title ?? '',
        url: s.url,
        excerpt: s.excerpt ?? '',
      }));
    return {
      title,
      url: d.url,
      excerpt: d.excerpt,
      score: d.score ?? 0,
      subResults,
      pageNumber: getPdfPageNumber(d.url, d.meta?.page),
    };
  });

  const grouped = groupPdfResults(results);
  state.totalResults = grouped.length;
  state.results = grouped;
}

function render(
  input: HTMLInputElement,
  resultsContainer: HTMLElement,
  state: State,
) {
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

  state.results.slice(0, MAX_RESULTS).forEach((result, i) => {
    const isActive = i === state.activeIndex;

    const a = document.createElement('a');
    a.id = `result-${i}`;
    a.role = 'option';
    a.setAttribute('aria-labelledby', `title-${i}`);
    a.className = isActive ? 'result is-active' : 'result';
    a.href = result.url;
    a.tabIndex = isActive || state.activeIndex < 0 ? 0 : -1;
    if (isActive) a.setAttribute('aria-selected', 'true');

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
    resultsDiv.insertBefore(infoSpan, resultsDiv.firstChild);
  }
  const n = state.totalResults;
  if (n === 0) infoSpan.innerText = 'No results';
  else if (n === 1) infoSpan.innerText = 'One result';
  else if (n <= MAX_RESULTS) infoSpan.innerText = `${n} results`;
  else infoSpan.innerText = `Showing first ${MAX_RESULTS} results`;

  if (state.showResults) {
    resultsContainer.classList.add('is-showing');
    resultsContainer.setAttribute('aria-hidden', 'false');
  } else {
    resultsContainer.classList.remove('is-showing');
    resultsContainer.setAttribute('aria-hidden', 'true');
  }

  input.setAttribute('aria-expanded', String(state.showResults));
  input.setAttribute('aria-controls', ol.id);
  if (state.activeIndex !== -1) {
    ol.setAttribute('aria-activedescendant', `result-${state.activeIndex}`);
  }
}

export default (window: Window) => {
  const input = document.querySelector(
    'input.quick-search',
  ) as HTMLInputElement | null;
  if (!input) return;

  const container = input.closest('.header-overlay-container') as HTMLElement;
  const resultsContainer = getElement(container, '.results-container');
  const resultsDiv = getElement(resultsContainer, '.results');

  // Unhide (hidden via inline style in template to prevent FOUC)
  resultsDiv.style.display = '';

  let entryETag: string | null = null;
  let entryLastModified: string | null = null;
  let lastIndexCheck = 0;
  let indexCheckInFlight = false;

  async function loadPagefind() {
    if (pagefind) return;
    // @ts-ignore pagefind.js is generated post-build, not resolvable at compile time
    pagefind = await import(
      /* webpackIgnore: true */ applyBasePath('/pagefind/pagefind.js')
    );
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
    if (indexCheckInFlight || Date.now() - lastIndexCheck < 3000) return;
    lastIndexCheck = Date.now();
    indexCheckInFlight = true;
    try {
      const res = await fetch(applyBasePath('/pagefind/pagefind-entry.json'), {
        method: 'HEAD',
        cache: 'no-cache',
      });
      if (!res.ok) return;
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
    activeIndex: -1,
  };

  async function update() {
    await doSearch(state);
    render(input!, resultsContainer, state);
  }

  function hide() {
    state.showResults = false;
    state.activeIndex = -1;
    render(input!, resultsContainer, state);
  }

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    if (value === state.value) return;
    state.value = value;
    state.activeIndex = -1;
    input!.removeAttribute('aria-activedescendant');
    update().catch(() => {});
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!state.showResults) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.activeIndex >= 0 && state.results[state.activeIndex]) {
        window.location.href = state.results[state.activeIndex].url;
      }
    }
  }

  function handleFocus() {
    checkForIndexUpdate().catch(() => {});
    if (!state.showResults) {
      state.showResults = true;
      update().catch(() => {});
    }
  }

  function handleResultClick(e: MouseEvent) {
    if (!state.showResults) return;
    const link = (e.target as HTMLElement).closest('a.result, a.sub-result');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    let target: URL;
    try {
      target = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (target.pathname === window.location.pathname) {
      hide();
    }
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && state.showResults) {
      state.value = '';
      input!.value = '';
      input!.blur();
      hide();
    }
  }

  function handleWindowClick() {
    if (state.showResults) hide();
  }

  function handleHeaderExpand() {
    if (state.showResults) hide();
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeyDown);
  input.addEventListener('focus', handleFocus);
  input.addEventListener('click', e => e.stopPropagation());
  container.addEventListener('click', e => e.stopPropagation());
  resultsContainer.addEventListener('click', handleResultClick);
  window.addEventListener('keydown', handleWindowKeyDown);
  window.addEventListener('click', handleWindowClick);
  on('headerWillExpand', handleHeaderExpand);

  return () => {
    remove('headerWillExpand', handleHeaderExpand);
    window.removeEventListener('click', handleWindowClick);
    window.removeEventListener('keydown', handleWindowKeyDown);
    resultsContainer.removeEventListener('click', handleResultClick);
    input!.removeEventListener('focus', handleFocus);
    input!.removeEventListener('keydown', handleKeyDown);
    input!.removeEventListener('input', handleInput);
  };
};
