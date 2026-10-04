# Header Title

The collapsed header shows the site title next to the logo. Once the visitor
scrolls past the page heading, the header shows the page title in its place.

## Scrolling

The site title and page title sit on a vertical reel behind a window one
header row tall. The header shows the page title once the whole page heading
block (breadcrumbs, `h1`, and page info in `.title-and-info`, or the
`.file-header` on code pages) has scrolled under the header: the reel rolls up,
moving the site title out the top while the page title enters from the bottom.
Scrolling back up rolls the reel down once the `h1` is entirely below the
header again. Between those points, while the `h1` is partly hidden but the
info line is still visible, the header keeps whichever title it is showing, so
the title does not flicker. Pages without a heading block show the site title.

The roll is a 300ms `transform` transition with `cubic-bezier(0.2, 0, 0, 1)`.
The window's top and bottom edges are feathered with a gradient mask, so a
title fades slightly as it rolls in or out; a title at rest is fully opaque.
There is no 3D effect. When the visitor requests reduced motion, the title
switches immediately. The title shown when the page loads, including after a
reload partway down the page, appears without rolling.

## Client-side navigation

Rolling stands for scrolling. When a client-side navigation changes the title
in the header, the header adopts the destination's page title and shows the
title for the destination's scroll position immediately, without rolling. The
header's View Transition layer crossfades the change over 150ms, matching the
page heading crossfade. For example, if the page title is showing and the
destination opens at its top, the header crossfades back to the site title;
going Back to a position past the heading crossfades to that page's title.
Navigations without a View Transition, including reduced-motion navigations
and in-place refreshes, switch immediately.

## Rendering

Both titles are rendered at build time in the navigation summary. The page
title uses the same formatted HTML as the page's `h1` (`page.titleHtml`), so
code page titles appear in a `<code>` element in the monospace font, and inline
code in Markdown titles does too. Code in the header title has no inline code
background or padding, matching the file title heading on code pages. Both
titles truncate with an ellipsis to the width left by the header controls. The whole title area is hidden from assistive
technology; the summary keeps its "Toggle site navigation" label, and clicking
either title still toggles the navigation. Hovering the summary underlines the
title that is showing.

## Without JavaScript

The page title is not displayed and the header shows only the site title,
exactly as before this feature. The mask and page title display are gated
behind the `.js` class.
