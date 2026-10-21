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

The animated stripe below the header appears as soon as the fetch begins. If
the response remains pending for 400ms, the whole document also uses the
`progress` cursor until the response arrives or the navigation falls back.
The cursor is delayed so fast navigations do not flash a transient busy state;
`progress` also communicates that another link can still be used to replace
the pending navigation.

Page transitions fade the page content in place over 150ms: outgoing content
fades with `ease-in`, and incoming content fades with `ease-out`. Link clicks,
Back, and Forward all use the same transition; there is no directional
movement.

When the page heading is visible, the breadcrumb trail, `h1`, and page info
get their own named transition layers (`page-breadcrumbs`, `page-title`, and
`page-info`) instead of fading with the page. They crossfade and move to
their new layout positions over the same 150ms with the
`cubic-bezier(0.2, 0, 0, 1)` curve, matching the header and search movement
curve, so they stay in step when the layout
changes.

The header keeps its own named `site-header` transition layer, so it does not
fade with the page. Before that layer's new snapshot is captured, the header
adopts the destination's page title and shows the title for the destination's
scroll position without rolling (see [Header Title](header-title.md)); any
change crossfades over the same 150ms as the page heading.

The footer and appearance-picker group gets its own named `page-bottom`
transition layer on each page where it is in the viewport; like the heading
parts, the navigator sets the name via inline style. The layer never fades
with the page or interpolates its bounds. When the group is on screen on both
pages, the layer does not crossfade; only the incoming snapshot is shown at its
destination layout position, so two copies are never visible at once. When it
is on screen on only one page, such as between a short page and the top of a
long page, that page's snapshot fades out or in where it is, with the same
150ms `ease-in` and `ease-out` fades as the page.
The document index (see [Document Index](document-index.md)) gets its own
`document-index` layer under the same rules, so it does not dim while the page
fades between two pages that both show it. Because it sits below the page
heading, which can differ in height, and may be stuck under the header on the
old page, its layer moves to its new position in step with the heading parts
instead of staying put.
Appearance pickers mount synchronously during the content swap, before the
browser captures that snapshot, so enabled states and visitor preferences
do not flash back to the build-time defaults. Custom elements that author
scripts define are upgraded during the swap too, because the new page's
scripts load before it (see [Author scripts](#author-scripts)). Other per-page
components mount after the transition finishes.

Persistent components (header, search, back-to-top, navigate) mount
once at startup. The page update toast also stays mounted and resets its
tracking state when navigation completes, adopting validators from the successful
HTML GET. The `tada:navigation` event includes `{ path, validators }` for clicks,
Back/Forward, and in-place refreshes. Per-page components are torn down and
re-mounted on every navigation.

## Author scripts

Scripts compiled from the site's `src/` directory and from packages mount and
unmount with each page through their default export, unmounting in reverse
order before Tada's own components; see [Author Scripts](author-scripts.md).
Before the swap, the navigator imports the new page's scripts, waiting at most
3 seconds, together with its stylesheets, while the loading indicator stays on.
Their top-level code, such as `customElements.define` calls, then runs before
the new content is inserted. Stylesheets those scripts import are added to
`<head>` for the pages that load them and removed when navigating to a page
that doesn't.

`<script>` elements in page content run each time the page is shown, both on a
cold load and after a client-side navigation. After the swap, once the URL,
title, stylesheets, and scroll position belong to the new page, the navigator
replaces each script in the new content with a fresh copy carrying the same
attributes and text, because browsers never run scripts that arrive through
parsed HTML. External scripts without `async` run in document order. A `defer`
attribute delays a script until parsing finishes on a cold load; after a
navigation the content is already in place when the script runs.

Classic scripts share one global scope across runs, so a script that runs again
after navigating away and back should wrap its code in a function or block to
avoid redeclaring `const` and `let` names. Code that must outlive one page can
listen for the `tada:navigation` event on `window`. Scripts in `src/` avoid
these issues and are the recommended way to add JavaScript.

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

Back/Forward and in-place refreshes keep `:target` matching the URL fragment,
as a document load would, so a highlighted code line follows the URL. Two
things can leave it stale. The navigator sets `history.scrollRestoration` to
`manual` so it can restore scroll after swapping content, and WebKit then skips
fragment processing when Back/Forward on the same page reaches an entry. And
swapped-in content never starts with a target. When `:target` does not match
the URL fragment, the navigator replaces the entry with a fragment navigation
(`#` when there is no fragment), then restores the entry's URL, history state,
and scroll position. On the same page this runs after the browser finishes the
traversal, so browsers that already updated `:target` are left alone. After a
swap it runs before new stylesheets are added, because WebKit delays fragment
scrolling until they load. Like a document load, the target is the element with
the fragment's ID, or else an `<a name>` anchor.

### Known WebKit difference

WebKit delays a fragment scroll while any stylesheet is still loading, and the
navigator does not work around it. If the visitor goes Back across pages to a
URL with a fragment while a stylesheet added by an earlier navigation is still
loading, WebKit can scroll to the fragment target after the navigator has
restored the saved scroll position, so the page ends up at the target instead
of where the visitor left it. It needs a stylesheet that is still loading at
that moment, which is rare, and it was only seen in WebKit. Nothing is lost:
the page is at the fragment the URL names. There is no test for it, because
the outcome depends on browser timing.

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
