# Slides Mode

Markdown pages can opt into Slides Mode with front matter:

```
---
title: My Deck
slides: true
---
```

HTML content pages cannot use `slides: true`; the build fails with an error if
an HTML source file sets it.

This does not change the page template. The page still builds as a normal
default page with its usual heading, metadata, and body content. Slide pages
add `Present` and `Present (Full Screen)` buttons in a `div.slides-header`
block at the top of the page body. These buttons render disabled in the HTML
and are re-enabled by the client-side slides component when JavaScript is
available. Touch/mobile browsers hide this header.

## Build output

On slide pages, top-level thematic breaks (`---`) in the Markdown body become
slide separators. Tada wraps the rendered content in
`<div class="slide-deck" data-slides-root>` and wraps each slide in
`<div class="slide" data-slide-index="N">`.

These wrappers are harmless in the default reading view: slide content stays in
normal document flow. Leading, trailing, and consecutive separators are ignored
so empty slides are not emitted.

Slide pages do not render `<hr>` output. This includes Markdown thematic
breaks and literal HTML `<hr>` tags that would otherwise appear in the page.

## Presentation view

Clicking `Present` enables a client-side presentation view without rebuilding
the page. Slides Mode applies `body.is-presenting` and shows one slide at a
time in a fixed viewport-sized layer above the rest of the page. Presentation
slides scale their content up with the viewport, with minimum and maximum
limits so they remain readable on both small and very large screens.

Clicking `Present (Full Screen)` starts the same slide presentation in the
browser's native Fullscreen API mode. In that mode the slide toolbar never
appears.

While presenting, the site header, title block, table of contents, footer, page
file header, and trace toolbars are hidden. The `Close` button appears only
when the pointer is moved into the top reveal zone near the button itself; it
hides again when the pointer leaves that zone. Slide and trace navigation
gestures hide the button and mouse cursor immediately. Moving the mouse shows
the cursor again. Leaving Slides Mode restores the normal page layout.

## Navigation

- `ArrowRight` moves forward
- `ArrowLeft` moves backward
- `Space` moves forward
- clicking the active slide moves forward
- `Escape` or `Close` exits Slides Mode

If the active slide contains trace widgets, those gestures try to move the
trace first and only change slides when the trace cannot move further. Entering
Slides Mode resets ready traces to their first step. See [Traces](traces.md).
When the presentation is already on its last slide and no active trace can move
forward, pressing `ArrowRight`, pressing `Space`, or clicking the slide reveals
the `Close` button and keeps it visible to signal that the deck is finished.
Going backward one slide or trace step hides it again.
