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
slides scale their content with the viewport while capping their width so they
remain readable on wide screens. Slides are anchored to the top of the viewport
and fill its height. Content that exceeds the viewport scrolls internally.

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
the cursor again. Leaving Slides Mode restores the normal page layout and uses
JavaScript to scroll the active slide back into view without changing the URL
hash.

## Navigation

- `ArrowRight` moves forward
- `ArrowLeft` moves backward
- `Space` moves forward
- clicking the presentation deck moves forward, including empty side gutters
- `Escape` or `Close` exits Slides Mode
- right-click toggles annotation mode on or off and suppresses the browser
  context menu

Clicking an unrevealed Q&A answer on the active slide reveals that answer
without moving forward. Once the answer is revealed, later clicks on it behave
like normal active-slide clicks and move forward.

Clicking an unanswered multiple choice option on the active slide selects that
option and reveals the correct answer without moving forward. Once the multiple
choice block is answered, later clicks on its options behave like normal
active-slide clicks and move forward.

If the active slide contains trace widgets, those gestures try to move the
trace first and only change slides when the trace cannot move further. Entering
Slides Mode resets ready traces to their first step. When `ArrowLeft` changes
to a previous slide, any ready traces on that slide reset to their first step so
the trace can be replayed from the beginning. See [Traces](traces.md).
When the presentation is already on its last slide and no active trace can move
forward, pressing `ArrowRight`, pressing `Space`, or clicking the slide reveals
the `Close` button and keeps it visible to signal that the deck is finished.
Going backward one slide or trace step hides it again.

## Annotations

While presenting, right-clicking the presentation deck toggles annotation mode.
Annotation mode changes the cursor to a simple pen cursor. In annotation mode,
left-clicking and dragging anywhere in the presentation viewport, including
the margins outside the width-capped slide, draws a `blueviolet` line on a
slide-associated `<canvas>` overlay.

While annotation mode is active, holding `Shift` temporarily switches to an
eraser cursor. Moving the pointer over the active slide while `Shift` is held
erases annotation marks within an 18 px circular radius without needing a click
or drag. A transparent preview ring with a `var(--bg2-color)` border follows
the pointer to show the erase radius. Releasing `Shift` returns to the pen
cursor.

Each slide stores its own annotation canvas in the presentation deck DOM while
presentation mode is active, so annotations remain visible when navigating away
from a slide and then back to it. The canvases cover the presentation viewport
rather than the slide content box. When the viewport is resized, existing
bitmap pixels stay at their top-left canvas coordinates: shrinking the viewport
cuts off pixels outside the new bounds, and expanding it adds empty transparent
space. Leaving Slides Mode removes the annotation canvases.

## Client event

The slides component listens on the slide root for a bubbling
`tada:slides-present` custom event. The event detail is
`{ slideIndex: number }`; `slideIndex` is clamped to the available slides and
the presentation mode is read from the `Full screen` checkbox. This internal
event is used by the slide-heading presentation buttons.
