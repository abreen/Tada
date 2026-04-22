# Client-Side Navigation

Clicks on internal links swap the page content in place instead of doing a
full reload. The header, search box, and back-to-top button stay mounted
across navigations. With JavaScript disabled, every link is a normal
`<a href>` and the browser handles it.

## What gets intercepted

Same-origin internal links, with no modifier keys held, no `target`
attribute, and not pointing to a non-HTML file (`.pdf`, `.java`, `.png`,
etc.). Everything else is left to the browser.

## What happens on a click

The navigator fetches the target page, parses it, and replaces the
`.container` element with the new one. It then updates the document
title, meta tags, and body class, and re-mounts per-page components
(TOC, anchors, code enhancements, etc.). The swap is wrapped in a
View Transition for a crossfade where supported.

Persistent components (header, search, back-to-top, navigate) mount
once at startup. The page update toast also stays mounted and resets its
tracking state when navigation completes. Per-page components are torn down and
re-mounted on every navigation.

## Scroll and `:target`

All scrolling is instant. On a forward navigation the page jumps to the
top, or to the URL's hash element if there is one. On back/forward the
page returns to the scroll position the user was last at for that entry.

Hash links use real fragment navigation (`location.hash` for same-page,
`location.replace` for cross-page) so `:target` CSS and `hashchange`
listeners keep working. On reload the navigator manually scrolls to the
URL hash once per-page components have mounted.

## When it falls back

If the fetch fails or returns a non-OK response, the navigator gives up
and does a normal full-page navigation to the target URL.

The navigator also falls back to a normal full-page navigation when the
fetched page is missing the Tada generator meta tag or it was generated
by a different Tada version.

The same fetch, swap, and fallback path is also used when the page update
toast refreshes the current URL in place. In that case, navigation preserves
the current scroll position, does not push a new history entry, and does not
run a View Transition.

## Search dismissal

Any client-side navigation clears the search input and dismisses any
open results.
