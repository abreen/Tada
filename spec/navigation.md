# Navigation

Site navigation is defined in `nav.yaml`/`nav.yml`/`nav.json` at the
project root. `tada init` creates `nav.yaml` by default. The file is an array
of sections, each with a title and a list of links.

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
individual page. Disabled links render as non-clickable UI without an `href`, so
they do not participate in link validation or reachability.

The collapsed header always keeps the menu control and site logo visible. The
site title uses the remaining width and truncates with an ellipsis only as
needed. Space on the trailing edge is reserved only for controls that are
currently present and visible: the search field above its narrow breakpoint,
and the back-to-top button after scrolling. This lets the back-to-top button
progressively shorten, and only when it consumes the remaining room replace,
the title.

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
