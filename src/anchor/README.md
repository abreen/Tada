# The `anchor` component

Append a link to each heading having an `id` attribute.

When the link is clicked, `window.location` is updated and the heading is
highlighted using the same function as the `toc` component.

The heading link includes a real inline SVG hash icon, revealed on heading
hover or link focus.

For slide title headings (`div.slide > h2:first-child`), append a
`Present from this slide` icon button. Clicking the button dispatches a
bubbling `tada:slides-present` custom event with the slide index so the slides
component can open presentation mode from that slide using the current
`Full screen` checkbox state.
