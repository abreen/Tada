# Navigation

Site navigation is defined in `nav.yaml`/`nav.yml`/`nav.json` at the
project root. `tada init` creates `nav.yaml` by default. The file is optional
(see [Without a nav file](#without-a-nav-file)). It is an array of sections,
each with a title and a list of links.

Each link has display text and either an internal path or an external URL.
External links open in a new tab with `rel="noopener noreferrer"`. Links can be
marked as disabled (rendered but not clickable).
Authored nav URLs are encoded when rendered so spaces and HTML-significant
characters do not appear raw in `href` attributes, while existing percent
escapes remain intact.

The navigation is validated against a JSON schema at build time. Internal links
are also validated against the set of known pages; a broken link fails the
build. Internal paths in the nav config must be root-relative (start with `/`)
because they are rendered site-wide from templates, not relative to any
individual page. Query strings and fragments are preserved in rendered links but
ignored when checking the target file; percent-encoded pathnames are decoded
for that check. Disabled links render as non-clickable UI without an `href`, so
they do not participate in link validation or reachability.

With JavaScript enabled, startup realigns an initial URL fragment after page
components finish mounting, including on reload. It uses the fragment captured
at initial page load and only realigns while the URL still matches that initial
URL. A fragment selected by later navigation from a fragment-free load does not
trigger startup alignment or overwrite a restored history scroll position.
Without JavaScript, the browser's native fragment navigation remains available.

With a nav, the collapsed header always keeps the menu control and site logo
visible. The
navigation summary (menu control, logo, and title area) and the trailing
controls share one CSS grid row: the summary takes a flexible first column and
the controls take a second column sized to their rendered content. The title
area shows the site title, or the page title once the page heading has
scrolled under the header (see [Header Title](header-title.md)). It
therefore uses exactly the width left by the controls that are currently
present and visible, the search field above its narrow breakpoint and the
back-to-top button after scrolling, and truncates with an ellipsis only as
needed. No control widths are hard-coded, so fonts, labels, and text sizes
cannot make the title overlap the controls or leave unused space before them.
The controls always keep their full width. The open navigation spans the full
header width beneath both columns.

The back-to-top button is client-only and appears only on long pages: the page
must be at least 3 viewports tall, and the reader must scroll past 1.5 viewports
or 25% of the scrollable distance, whichever is farther. Visibility updates on
scroll and resize.

Opening and closing the header morphs one inline SVG between the menu and close
states: its top and bottom strokes shorten, move, and rotate into two halves of
one diagonal while its middle stroke shortens and rotates into the other. All
three strokes remain opaque. Animated dash lengths change the drawn strokes
while preserving their width and round end caps without scaling them. The fold
uses a 260ms `cubic-bezier(0.65, 0, 0.35, 1)` transition in both directions.
The hamburger retains its compact spacing, with horizontal strokes from x=3 to
x=21 at y=6, 12, and 18 in the 24-unit view box. The square X has endpoints at
x=6 and 18, y=6 and 18. Both states share the same center and 13.65-unit painted
height, including the 1.65-unit round stroke; the X is narrower than the
19.65-unit-wide hamburger. Browsers that support both the `::details-content`
pseudo-element and discrete transitions expand and collapse the navigation
content while it fades and moves a short distance. Other browsers retain the
native immediate disclosure behavior. The effects follow the native `open`
state. Without JavaScript, the icon still animates and the menu remains fully
functional, with its navigation content opening immediately. All state changes
are immediate when the visitor requests reduced motion.

While the navigation is open, a fixed translucent wash covers the page content
below the header. It uses the active theme's translucent primary background,
so it adapts to light, dark, and high-contrast palettes. The wash blocks pointer
interaction with the page. With JavaScript enabled, clicking it dismisses the
navigation without activating the content beneath it. Without JavaScript, the
native summary remains available to close the navigation. The wash fades with
the navigation unless the visitor requests reduced motion.

Directory-only links, including `/`, must reference `index.html` explicitly
(for example, `/docs/index.html` instead of `/docs/`). If the corresponding
index page exists, the build reports its expected path in the error.

## Without a nav file

A site may omit the nav file. An empty nav array is treated the same way. The
header then has no `<details>` element, menu icon, or navigation wash: a
`.header-brand` element shows the logo and site title instead of the summary,
and the title is not hidden from assistive technology since no summary label
replaces it. Neither the logo nor the title is a link. Adding or deleting the
nav file in watch mode rebuilds every page with the matching header.

When search is enabled, the header stays fixed at the top of the viewport. The
search field and back-to-top button keep their places in the trailing controls
column, and the title rolls to the page title while scrolling (see
[Header Title](header-title.md)).

When search is also disabled, the header is static. The root element gets the
`static-header` class, the header sits in the normal page flow, and the logo
and site title are centered at the top of each page with no background. It has
no trailing controls: the back-to-top button is not rendered and its client
component does not mount. The header scrolls away with the page, so it shows
only the site title, with no page title reel. Page content, the sticky TOC,
and fragment scroll positions no longer reserve space for a fixed header; the
`--header-offset` custom property is `0px` instead of the collapsed header
height. The header stays positioned, so the navigation loading bar still
appears beneath it. During client-side navigation its View Transition layer is
pinned at its new position and shows only the incoming snapshot, so it neither
slides from where the old page scrolled it nor fades with the page.
