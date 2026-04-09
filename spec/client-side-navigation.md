# Client-Side Navigation

Tada includes a client-side navigation component that intercepts clicks on
internal links and swaps page content without a full page reload. This
preserves the header and search UI state across navigations and eliminates the
white flash of full-page loads.

The feature is always active and requires no configuration. It degrades
gracefully when JavaScript is disabled: all links are standard `<a>` elements
pointing to real HTML files.

## How it works

When a user clicks an eligible internal link, the navigator fetches the target
page, parses the HTML, and replaces the content inside the `.container`
element. The `<header>` (which contains the navigation sidebar, search input,
and back-to-top button) is never touched.

After swapping, the navigator updates the document title, meta tags, and body
class, then re-mounts per-page components (table of contents, anchor links,
question toggles, etc.).

## Link eligibility

A link is intercepted only if all of these are true:

- Same origin as the current page
- Not a hash-only link on the current page
- No `target` attribute
- No modifier keys held (Ctrl, Meta, Shift, Alt)
- The URL path does not end with a non-HTML file extension (e.g., `.pdf`,
  `.java`, `.py`, `.png`, `.zip`)

## Scroll behavior

On forward navigation (link click), the page scrolls to the top, or to the
element matching the URL hash if present. On back/forward navigation
(popstate), the scroll position is restored to where the user was when they
left the page.

## View Transitions

The content swap is wrapped in a view transition using
`document.startViewTransition`, producing a crossfade. The API is supported
in all major browsers (Chrome 111+, Firefox 126+, Safari 18+). If a browser
does not support it, the swap happens instantly.

## Component lifecycle

Components are split into two groups:

**Persistent** (mounted once, never torn down): header, search, back-to-top,
navigate.

**Per-page** (torn down and re-mounted on each navigation): table of contents,
anchor links, question toggles, timezone chooser, code enhancements, trace
widgets, print handler.

## Error handling

If the page fetch fails or returns a non-OK status, the navigator falls back
to a normal full-page navigation.

## Search dismissal

When a client-side navigation occurs, the search input is cleared and results
are dismissed.
