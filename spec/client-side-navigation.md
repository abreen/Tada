# Client-Side Navigation

Clicks on internal links swap the page content in place instead of doing a
full reload. The header, search box, and back-to-top button stay mounted
across navigations. With JavaScript disabled, every link is a normal
`<a href>` and the browser handles it.

## What gets intercepted

Same-origin internal links under the configured `basePath`, with no modifier
keys held, no `target` or `download` attribute, and a build-time
`data-tada-page` marker identifying a generated Tada destination. Non-root base paths match by path segment: `/course`
matches `/course` and `/course/page.html`, but not `/course2/page.html`.
Same-page links are handled locally before requiring a marker, with no request.
Unmarked cross-page links, including copied public HTML and links created by
author JavaScript, use normal browser navigation without a speculative fetch.
Search marks generated-page results and their fragment subresults using Pagefind
template metadata; PDF results remain unmarked. Everything else is left to the browser.
Download links retain native browser behavior even when the `download`
attribute is empty or the target is an HTML page.

## What happens on a click

The navigator fetches the target page, parses it, and replaces the
`.container` element with the new one. It then updates the document
title, meta tags, and body class, and re-mounts per-page components
(TOC, anchors, code enhancements, etc.). The swap is wrapped in a
View Transition where supported unless the visitor has requested reduced
motion with `prefers-reduced-motion: reduce`. Reduced-motion navigations use
the same immediate content swap without calling the View Transition API.

Page transitions slide horizontally by 8px over 150ms. Both outgoing and
incoming content use `cubic-bezier(0.2, 0, 0, 1)` for movement, matching the
header and search movement curve. Opacity animates independently over the
same duration: outgoing content fades with `ease-in`, and incoming content
fades with `ease-out`. Forward navigation slides left; back navigation slides
right.

When the page heading is visible, the breadcrumb trail, `h1`, and page info
get their own named transition layers (`page-breadcrumbs`, `page-title`, and
`page-info`) instead of sliding with the page. They crossfade in place and
move to their new layout positions over the same 150ms with the same
`cubic-bezier(0.2, 0, 0, 1)` curve, so they stay in step when the layout
changes.

The header keeps its own named `site-header` transition layer, so it does not
slide with the page. Before that layer's new snapshot is captured, the header
adopts the destination's page title and shows the title for the destination's
scroll position without rolling (see [Header Title](header-title.md)); any
change crossfades over the same 150ms as the page heading.

The footer and appearance-picker group uses its own named `page-bottom`
transition layer. It does not slide, crossfade, or interpolate its bounds;
only the incoming snapshot is shown at its destination layout position.
Appearance pickers mount synchronously during the content swap, before the
browser captures that snapshot, so enabled states and visitor preferences
do not flash back to the build-time defaults. Other per-page components mount
after the transition finishes.

Persistent components (header, search, back-to-top, navigate) mount
once at startup. The page update toast also stays mounted and resets its
tracking state when navigation completes, adopting validators from the successful
HTML GET. The `tada:navigation` event includes `{ path, validators }` for clicks,
Back/Forward, and in-place refreshes. Per-page components are torn down and
re-mounted on every navigation.

## Scroll and `:target`

All scrolling is instant. On a forward navigation the page jumps to the
top, or to the URL's hash element if there is one. On back/forward the
page returns to the scroll position the user was last at for that entry.

Hash links use real fragment navigation (`location.hash` for same-page,
`location.replace` for cross-page) so `:target` CSS and `hashchange`
listeners keep working. On cold load and reload the navigator manually scrolls
to the initial URL hash once per-page components have mounted, provided the URL
still matches the captured starting URL. A fragment selected later from a
fragment-free load does not cause startup alignment to overwrite the visitor's
restored history scroll position.

A link to the current page without a fragment clears any active fragment and
scrolls to the top without fetching the page again. Clearing a fragment adds a
history entry so Back restores the previous fragment and scroll position;
clicking the already fragment-free URL does not add a duplicate entry.

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
