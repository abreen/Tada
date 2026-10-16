# Client-Side Components

Tada includes several interactive components that run in the browser.

Each component lives in `src/<name>/` with an `index.ts` (exporting async
`mount()`) and, if it has styles, a Sass partial `_index.scss`. To include a
component's styles in the stylesheet, load the partial from `src/style.scss`
with `@use '<name>'`; the position of that rule sets its cascade order. Do not
import Sass from TypeScript: `src/index.ts` imports only `style.scss`, which is
compiled once per build (see [CSS Strategy](css-strategy.md)). Shared utilities
are in `src/util.ts`.

- **Anchor links**: clickable headings that scroll themselves into view; slide
  title headings also get a presentation icon button
- **Table of contents**: a floating sidebar highlighting the current section
  based on scroll position
- **Document index**: keeps the current page's entry centered in a scrolling
  index, on load and when the index changes size (see
  [Document Index](document-index.md))
- **Search**: a search field in the header querying the Pagefind index (see
  [Search](search.md))
- **Q&A toggle**: reveals answers in question-and-answer blocks on click and
  handles multiple choice selections
- **Appearance pickers**: page-bottom segmented controls that independently
  switch fonts between sans-serif and serif and neutral colors between standard
  and high contrast, persisted in local storage (see
  [Font Picker](font-picker.md) and [Contrast Picker](contrast-picker.md))
- **Scroll-to-top button**: appears when the user scrolls down the page; not
  rendered with a static header (no nav and no search)
- **Print handler**: opens all collapsible details before printing
- **Details**: closing a tall details element from its stuck summary scrolls
  the closed details into view (see [Details](details.md))
- **Code scrollbar**: a sticky horizontal scrollbar for code pages, synced
  with the code body so wide code can be scrolled from the bottom of the viewport
- **Header navigation**: collapsible header with logo, title, and nav links;
  closes on outside clicks, Escape, and identified focus moves outside the menu,
  while unknown focus destinations remain open so Safari link clicks complete;
  rolls the title from the site title to the page title once the page heading
  scrolls under a fixed header (see [Header Title](header-title.md)). Without
  a nav, only the title roll applies (see
  [Navigation](navigation.md#without-a-nav-file))
- **Page update toast**: floating bottom toast that checks the current page
  for newer validators and offers an in-place refresh
- **Slides**: page-local presentation mode for Markdown pages with
  `slides: true`; it reads slide wrapper markup, opens from a `Present` button,
  chooses fullscreen from a `Full screen` checkbox, opens from slide-heading
  presentation buttons via a local custom event, and shows one slide at a time
  with keyboard and click navigation (see [Slides Mode](slides.md))
- **Tabs**: applies the WAI-ARIA tabs pattern to build-time tab groups, with
  arrow key navigation and selection of the tab containing the URL's target
  (see [Tabs](tabs.md))
- **Search highlighting**: on a page opened from a search result, highlights
  the searched words with an animated highlighter sweep and opens the tab
  containing the first match (see [Search Highlighting](search-highlighting.md))
- **Traces**: widget that renders execution traces generated at build time and
  renders a stack and heap memory diagram (see [Traces](traces.md))
