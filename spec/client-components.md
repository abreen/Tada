# Client-Side Components

Tada includes several interactive components that run in the browser.

Each component lives in `src/<name>/` with an `index.ts` (exporting async
`mount()`) and `style.scss`. Import Sass styles in `src/index.ts` to include
them in the bundle. Shared utilities are in `src/util.ts`.

- **Anchor links**: clickable anchor icons on headings that scroll the heading
  into view
- **Table of contents**: a floating sidebar highlighting the current section
  based on scroll position
- **Search**: a combobox in the header querying the Pagefind index (see
  [Search](search.md))
- **Q&A toggle**: reveals answers in question-and-answer blocks on click
- **Time zone chooser**: a dropdown that reformats all `<time>` elements to
  the selected zone, persisted in local storage (see [Time Zones](time-zones.md))
- **Scroll-to-top button**: appears when the user scrolls down the page
- **Print handler**: opens all collapsible details before printing
- **Code scrollbar**: a sticky horizontal scrollbar for code pages, synced
  with the code body so wide code can be scrolled from the bottom of the viewport
- **Header navigation**: collapsible header with logo, title, and nav links
- **Traces**: widget that renders execution traces generated at build time and
  renders a stack and heap memory diagram (see [Traces](traces.md))

