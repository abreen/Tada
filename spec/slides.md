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
add a `Present` button and a checked `Full screen` checkbox with
`id="slides-fullscreen"` in a `div.slides-header` block at the top of the page
body. These controls render disabled in the HTML and are re-enabled by the
client-side slides component when JavaScript is available. Touch/mobile
browsers hide this header.

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

When `Full screen` is checked, clicking `Present` starts the presentation in
the browser's native Fullscreen API mode. In that mode the slide toolbar never
appears. When `Full screen` is unchecked, `Present` starts the same
presentation in normal mode. The client stores the user's `Full screen`
checkbox preference in local storage and restores it on later slide pages.

Slide title headings (`div.slide > h2:first-child`) include a hover/focus
`Present from this slide` icon button. It opens the same presentation view from
that slide, using the current `Full screen` checkbox state. If fullscreen is
requested but the browser Fullscreen API is unavailable or rejects the request,
presentation remains active in normal mode at the requested slide.

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

Clicking an unrevealed Q&A answer on the active slide reveals that answer
without moving forward. Once the answer is revealed, later clicks on it behave
like normal active-slide clicks and move forward.

If the active slide contains trace widgets, those gestures try to move the
trace first and only change slides when the trace cannot move further. Entering
Slides Mode resets ready traces to their first step. When `ArrowLeft` changes
to a previous slide, any ready traces on that slide reset to their first step so
the trace can be replayed from the beginning. See [Traces](traces.md).
When the presentation is already on its last slide and no active trace can move
forward, pressing `ArrowRight`, pressing `Space`, or clicking the slide reveals
the `Close` button and keeps it visible to signal that the deck is finished.
Going backward one slide or trace step hides it again.

## Client event

The slides component listens on the slide root for a bubbling
`tada:slides-present` custom event. The event detail is
`{ slideIndex: number }`; `slideIndex` is clamped to the available slides and
the presentation mode is read from the `Full screen` checkbox. This internal
event is used by the slide-heading presentation buttons.
