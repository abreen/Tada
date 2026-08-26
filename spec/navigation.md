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
states: its top and bottom strokes move and rotate into the two diagonals while
its middle stroke fades. Browsers that support both the `::details-content`
pseudo-element and discrete transitions expand and collapse the navigation
content while it fades and moves a short distance. Other browsers retain the
native immediate disclosure behavior. The effects follow the native `open`
state. Without JavaScript, the menu remains fully functional and opens
immediately. All state changes are also immediate when the visitor requests
reduced motion.
