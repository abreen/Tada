# The `header` component

CSS morphs the header's three-stroke inline SVG between menu and close states
and, where supported, animates its `<details>` content. The component's
JavaScript adds dismissal behavior for outside clicks, focus leaving the menu,
and the Escape key.

This component doesn't provide any other functionality related to the header.
If JavaScript is turned off in the web browser, the `<details>` element is still
functional and its disclosure content opens immediately.
