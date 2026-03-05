import { getElement, applyBasePath } from '../util';
import { on, remove } from '../global';

const SEARCH_MAX_RESULTS = 24;

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
  maxNumResults: number;
  results: Result[];
  totalResults: number;
  // -1 means no active selection
  activeIndex: number;
};

function normalizeSearchUrl(url: string): string {
  return url.replace(/#m(\d+)$/, '#L$1');
}

async function update(
  input: HTMLInputElement,
  container: HTMLElement,
  isQuickSearch: boolean,
  state: State,
) {
  if (pagefind == null) {
    return;
  }

  if (!state.value) {
    state.results = [];
    state.totalResults = 0;
    state.activeIndex = -1;
    renderResults(
      input,
      container,
      state.results,
      state.showResults,
      state.maxNumResults,
      state.activeIndex,
      isQuickSearch,
      state.totalResults,
    );
    return;
  }

  const search = await pagefind.search(state.value);
  state.totalResults = search.results.length;
  const limit = SEARCH_MAX_RESULTS;
  const slice = search.results.slice(0, limit);
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
    const rawSubResults: SubResult[] = (d.sub_results ?? [])
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
        url: normalizeSearchUrl(s.url),
        excerpt: s.excerpt ?? '',
      }));
    return {
      title,
      url: normalizeSearchUrl(d.url),
      excerpt: d.excerpt,
      score: d.score ?? 0,
      subResults: rawSubResults,
      pageNumber: getPdfPageNumber(d.url, d.meta?.page),
    };
  });

  const groupedResults = groupPdfResults(results);
  state.maxNumResults = SEARCH_MAX_RESULTS;
  state.totalResults = groupedResults.length;
  state.results = groupedResults;

  renderResults(
    input,
    container,
    state.results,
    state.showResults,
    state.maxNumResults,
    state.activeIndex,
    isQuickSearch,
    state.totalResults,
  );
}

function getPdfPageNumber(
  url: string,
  pageMeta: string | undefined,
): number | null {
  const fromMeta = Number.parseInt(pageMeta ?? '', 10);
  if (Number.isInteger(fromMeta) && fromMeta > 0) {
    return fromMeta;
  }

  const match = url.match(/#(?:.*&)?page=(\d+)\b/i);
  if (!match) {
    return null;
  }

  const fromUrl = Number.parseInt(match[1], 10);
  if (!Number.isInteger(fromUrl) || fromUrl < 1) {
    return null;
  }

  return fromUrl;
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

function renderInfo(
  parent: HTMLElement,
  numResults: number,
  maxNumResults: number,
) {
  let span = parent.querySelector('.results-info') as HTMLSpanElement | null;
  if (!span) {
    span = window.document.createElement('span');
    span.className = 'results-info';
    parent.insertBefore(span, parent.firstChild);
  }

  if (numResults === 0) {
    span.innerText = 'No results';
  } else if (numResults === 1) {
    span.innerText = 'One result';
  } else if (numResults <= maxNumResults) {
    span.innerText = `${numResults} results`;
  } else {
    span.innerText = `Showing first ${maxNumResults} results`;
  }
}

function renderResults(
  input: HTMLInputElement,
  parent: HTMLElement,
  results: Result[],
  showResults: boolean,
  maxNumResults: number,
  activeIndex: number,
  isQuickSearch: boolean,
  totalResults: number,
) {
  const resultsContainer = getElement(parent, '.results-container');

  const ol = window.document.createElement('ol');

  results.slice(0, maxNumResults).forEach((result, i) => {
    const isActive = i === activeIndex;

    const a = window.document.createElement('a');
    a.id = `result-${i}`;
    a.role = 'option';
    a.setAttribute('aria-labelledby', `title-${i}`);
    a.setAttribute('data-index', String(i));

    const classes = ['result'];
    if (isActive) {
      classes.push('is-active');
    }
    a.className = classes.join(' ');

    a.href = result.url;
    if (activeIndex < 0) {
      a.tabIndex = 0;
    } else if (isActive) {
      a.tabIndex = 0;
      a.setAttribute('aria-selected', 'true');
    } else {
      a.tabIndex = -1;
    }

    const titleEl = window.document.createElement('div');
    titleEl.id = `title-${i}`;
    titleEl.className = 'title';
    titleEl.textContent = String(result.title);
    a.appendChild(titleEl);

    const subtitle = window.document.createElement('div');
    subtitle.className = 'subtitle';
    subtitle.innerText = result.url;
    a.appendChild(subtitle);

    const excerpt = window.document.createElement('div');
    excerpt.className = 'excerpt';
    // Pagefind returns excerpts with <mark> tags, use innerHTML to render highlights
    excerpt.innerHTML = result.excerpt;
    a.appendChild(excerpt);

    const li = window.document.createElement('li');
    li.appendChild(a);

    const maxSubResults = 5;
    const subResultsToShow = result.subResults.slice(0, maxSubResults);

    if (subResultsToShow.length > 0) {
      const subList = window.document.createElement('ul');
      subList.className = 'sub-results';

      subResultsToShow.forEach(sub => {
        const subA = window.document.createElement('a');
        subA.href = sub.url;
        subA.className = 'sub-result';

        const subTitle = window.document.createElement('div');
        subTitle.className = 'title';
        subTitle.textContent = sub.title;
        subA.appendChild(subTitle);

        if (sub.excerpt) {
          const subExcerpt = window.document.createElement('div');
          subExcerpt.className = 'excerpt';
          subExcerpt.innerHTML = sub.excerpt;
          subA.appendChild(subExcerpt);
        }

        const subLi = window.document.createElement('li');
        subLi.appendChild(subA);
        subList.appendChild(subLi);
      });

      li.appendChild(subList);
    }

    ol.appendChild(li);
  });

  if (!showResults) {
    resultsContainer.classList.add('is-hidden');
    resultsContainer.setAttribute('aria-hidden', 'true');
  }

  let div = resultsContainer.querySelector('.results') as HTMLElement | null;
  if (div) {
    div.replaceChildren(ol);
  } else {
    div = window.document.createElement('div');
    div.className = 'results';
    div.appendChild(ol);
  }

  renderInfo(div, totalResults, maxNumResults);

  if (showResults) {
    resultsContainer.setAttribute('aria-hidden', 'false');
    resultsContainer.classList.remove('is-hidden');
  }

  input.setAttribute('aria-expanded', String(showResults));

  const listboxId = `${input.name}-results`;
  input.setAttribute('aria-controls', listboxId);
  ol.id = listboxId;
  ol.role = 'listbox';

  if (activeIndex !== -1) {
    ol.setAttribute('aria-activedescendant', `result-${activeIndex}`);
  }
}

function getSearchInputs(): HTMLInputElement[] {
  return Array.from(window.document.querySelectorAll('input.search'));
}

function isQuickSearch(el: HTMLInputElement | null) {
  if (!el) {
    return false;
  }
  return el.classList.contains('quick-search');
}

function dispatchInputEvents(inputs: HTMLInputElement[]) {
  inputs.forEach(el => {
    if (el.value) {
      const event = new Event('input');
      el.dispatchEvent(event);
    }
  });
}

export default (window: Window) => {
  const searchInputs = getSearchInputs();
  if (searchInputs.length === 0) {
    return;
  }

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
        // Reset pagefind so it reloads on next query
        pagefind = null;
        await loadPagefind();
        searchInputs.forEach((input, i) => {
          update(input, containers[i], isQuickSearch(input), state).catch(
            () => {},
          );
        });
      }
    } catch (_) {
      // best-effort
    } finally {
      indexCheckInFlight = false;
    }
  }

  loadPagefind()
    .then(() => dispatchInputEvents(searchInputs))
    .catch(err => {
      console.log(`failed to load Pagefind: ${err}`);
    });

  const state: State = {
    value: '',
    showResults: false,
    maxNumResults: -1,
    results: [],
    totalResults: 0,
    activeIndex: -1,
  };

  const containers = searchInputs.map(
    el => el.parentElement?.parentElement as HTMLDivElement,
  );

  // Clicks inside .header-overlay-container don't bubble to window → results stay open
  containers.forEach(container =>
    container.addEventListener('click', e => e.stopPropagation()),
  );

  const resultsContainers = containers.map(el =>
    getElement(el, '.results-container'),
  );

  const inputHandlers: Array<(e: Event) => void> = searchInputs.map((_, i) => {
    return function handleInput(e: Event) {
      const value = (e.target as HTMLInputElement).value;
      if (value === state.value) {
        return;
      }

      if (window.IS_DEV) {
        console.info(`searchbox input value: "${value}"`);
      }

      state.value = value;
      state.activeIndex = -1;
      searchInputs[i].removeAttribute('aria-activedescendant');
      update(
        searchInputs[i],
        containers[i],
        isQuickSearch(searchInputs[i]),
        state,
      ).catch(() => {});
    };
  });

  const keyDownHandlers: Array<(e: KeyboardEvent) => void> = searchInputs.map(
    (_, i) => {
      return function handleKeyDown(e: KeyboardEvent) {
        if (!state.showResults) {
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          if (state.activeIndex >= 0 && state.results[state.activeIndex]) {
            window.location.href = state.results[state.activeIndex].url;
          }
          return;
        }
      };
    },
  );

  const focusHandlers: Array<(e: Event) => void> = searchInputs.map((_, i) => {
    return function handleFocus() {
      checkForIndexUpdate().catch(() => {});
      if (!state.showResults) {
        if (window.IS_DEV) {
          console.info('showing search results due to searchbox focus');
        }

        state.showResults = true;
        update(
          searchInputs[i],
          containers[i],
          isQuickSearch(searchInputs[i]),
          state,
        ).catch(() => {});
      }
    };
  });

  const clickHandlers: Array<(e: MouseEvent) => void> = searchInputs.map(_ => {
    return function handleClick(e: MouseEvent) {
      // Prevent this click from closing the header <details> element
      e.stopPropagation();
    };
  });

  const mouseOverResultsHandlers: Array<(e: MouseEvent) => void> =
    resultsContainers.map((_, i) => {
      return function handleMouseOver(e: MouseEvent) {
        if (!state.showResults) {
          return;
        }

        const result = (e.target as HTMLElement).closest('.result');
        if (!result) {
          return;
        }
      };
    });

  const clickResultsHandlers: Array<(e: MouseEvent) => void> =
    resultsContainers.map((_, i) => {
      return function handleResultClick(e: MouseEvent) {
        if (!state.showResults || !isQuickSearch(searchInputs[i])) {
          return;
        }

        const resultLink = (e.target as HTMLElement).closest(
          'a.result, a.sub-result',
        );
        if (!resultLink) {
          return;
        }

        const href = resultLink.getAttribute('href');
        if (!href) {
          return;
        }

        let target: URL;
        try {
          target = new URL(href, window.location.href);
        } catch {
          return;
        }

        if (target.pathname !== window.location.pathname) {
          return;
        }

        state.showResults = false;
        state.activeIndex = -1;
        update(
          searchInputs[i],
          containers[i],
          isQuickSearch(searchInputs[i]),
          state,
        ).catch(() => {});
      };
    });

  inputHandlers.forEach((handleInput, i) => {
    searchInputs[i].addEventListener('input', handleInput);
  });

  keyDownHandlers.forEach((handleKeyDown, i) => {
    searchInputs[i].addEventListener('keydown', handleKeyDown);
  });

  focusHandlers.forEach((handleFocus, i) => {
    searchInputs[i].addEventListener('focus', handleFocus);
  });

  clickHandlers.forEach((handleClick, i) => {
    searchInputs[i].addEventListener('click', handleClick);
  });

  mouseOverResultsHandlers.forEach((handleMouseOver, i) => {
    resultsContainers[i].addEventListener('mouseover', handleMouseOver);
  });
  clickResultsHandlers.forEach((handleClick, i) => {
    resultsContainers[i].addEventListener('click', handleClick);
  });

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && state.showResults) {
      if (window.IS_DEV) {
        console.info('hiding search results due to Esc on window');
      }

      state.value = '';
      state.showResults = false;
      state.activeIndex = -1;
      containers.forEach((container, i) => {
        searchInputs[i].blur();
        update(
          searchInputs[i],
          container,
          isQuickSearch(searchInputs[i]),
          state,
        ).catch(() => {});
      });
      return;
    }
  }

  window.addEventListener('keydown', handleWindowKeyDown);

  function handleWindowClick(e: MouseEvent) {
    if (state.showResults) {
      if (window.IS_DEV) {
        console.info('closing search results due to outside window click');
      }

      state.showResults = false;
      state.activeIndex = -1;
      containers.forEach((container, i) => {
        update(
          searchInputs[i],
          container,
          isQuickSearch(searchInputs[i]),
          state,
        ).catch(() => {});
      });
    }
  }

  window.addEventListener('click', handleWindowClick);

  function handleHeaderExpand() {
    if (state.showResults) {
      if (window.IS_DEV) {
        console.info('hiding search results due to header expansion');
      }
      state.showResults = false;
      state.activeIndex = -1;
      containers.forEach((container, i) => {
        update(
          searchInputs[i],
          container,
          isQuickSearch(searchInputs[i]),
          state,
        ).catch(() => {});
      });
    }
  }
  on('headerWillExpand', handleHeaderExpand);

  return () => {
    remove('headerWillExpand', handleHeaderExpand);
    window.removeEventListener('click', handleWindowClick);

    window.removeEventListener('keydown', handleWindowKeyDown);

    mouseOverResultsHandlers.forEach((handleMouseOver, i) => {
      resultsContainers[i].removeEventListener('mouseover', handleMouseOver);
    });
    clickResultsHandlers.forEach((handleClick, i) => {
      resultsContainers[i].removeEventListener('click', handleClick);
    });

    clickHandlers.forEach((handleClick, i) => {
      searchInputs[i].removeEventListener('click', handleClick);
    });

    focusHandlers.forEach((handleFocus, i) => {
      searchInputs[i].removeEventListener('focus', handleFocus);
    });

    keyDownHandlers.forEach((handleKeyDown, i) => {
      searchInputs[i].removeEventListener('keydown', handleKeyDown);
    });

    inputHandlers.forEach((handleInput, i) => {
      searchInputs[i].removeEventListener('input', handleInput);
    });
  };
};
