# The `header` component

CSS morphs the header's three-stroke inline SVG between menu and close states
and, where supported, animates its `<details>` content. The component's
JavaScript adds dismissal behavior for outside clicks, focus leaving the menu,
and the Escape key.

The component also rolls the header title between the site title and the page
title as the page heading scrolls under the header (see
[Header Title](../../spec/header-title.md)). The navigator calls
`swapHeaderTitle()` after each content swap so the header adopts the new page
title and shows the title for the new scroll position without rolling.

If JavaScript is turned off in the web browser, the `<details>` element is still
functional and its disclosure content opens immediately, and the header shows
only the site title.
