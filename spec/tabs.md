# Tabs

A tab group shows alternative versions of the same content, such as one
example in several programming languages, with one panel visible at a time.

## Syntax

Each tab opens with a line containing `[`, a label, and `|`, and closes with a
line containing only `]`:

```
[Java|

Content in the first tab.

]
[Python|

Content in the second tab.

]
```

- Consecutive tabs form one group. Blank lines between a closing `]` and the
  next opening line are allowed; any other content ends the group and a later
  tab starts a new group. A single tab is a valid group.
- The label is trimmed and accepts inline Markdown, such as emphasis and code
  spans. An empty label, a label starting with `^`, and text after the `|` do
  not open a tab. Brackets in the label must be balanced, as in link text
  (brackets in code spans and escaped brackets do not count), so a line such
  as a table row starting with a link (`[a](b) | c |`) does not open a tab.
- The tab button shows the label without links or footnote references, since a
  button cannot contain links. The panel's label keeps them.
- The button's label is wrapped in a `tabs-tab-label` span, trimmed with
  `text-box: trim-both cap alphabetic`, so the tab centers its capitals instead
  of relying on the font's ascent and descent, which Chromium rounds to whole
  pixels on low-resolution displays. Browsers without `text-box` center the
  line as before.
- Opening and closing lines must be indented less than four columns, like
  other block syntax. Inside fenced or indented code, and inside raw HTML
  blocks that keep their lines verbatim (such as `<pre>`), they stay literal.
- A panel's content is parsed as full Markdown. Panels may be empty, and tab
  groups may be nested inside a panel.
- A closing line closes the nearest open tab before it, so tabs nest like
  brackets. A tab inside a list item must close within that item. An opening
  line without a matching closing line is ordinary text.

## Generated HTML

The build renders every panel, so all content is indexed by search and
reachable by links:

```
<div class="tabs" id="tabs-1">
<div class="tabs-track">
<button type="button" class="tabs-scroll tabs-scroll-start" tabindex="-1" aria-hidden="true" hidden=""></button>
<div class="tabs-list">
<button type="button" class="tabs-tab" id="tabs-1-tab-1" data-selected="" disabled=""><span class="tabs-tab-label">Java</span></button>
<button type="button" class="tabs-tab" id="tabs-1-tab-2" disabled=""><span class="tabs-tab-label">Python</span></button>
</div>
<button type="button" class="tabs-scroll tabs-scroll-end" tabindex="-1" aria-hidden="true" hidden=""></button>
</div>
<div class="tabs-panels">
<div class="tabs-panel" id="tabs-1-panel-1" data-selected="">
<p class="tabs-panel-label" data-pagefind-ignore="">Java</p>
...
</div>
<div class="tabs-panel" id="tabs-1-panel-2">
<p class="tabs-panel-label" data-pagefind-ignore="">Python</p>
...
</div>
</div>
</div>
```

Groups are numbered in document order on each page (`tabs-1`, `tabs-2`, ...).
A number is skipped when any of its group's IDs is already used in the
Markdown, such as by a heading titled "Tabs 1". Groups in the
[site banner](banner.md), which is rendered separately, are numbered
`banner-tabs-1`, `banner-tabs-2`, ... so their IDs never collide with the
page's. The first tab is selected.

Panel labels are excluded from the search index (`data-pagefind-ignore`)
because each label is already indexed as its tab button's text.

## Without JavaScript and in print

The tab list is hidden. Every panel is shown, stacked inside one bordered box
(the same box as with JavaScript), each under its label and separated by a
rule as thick as the box's border, in the same color. In print, the box and
rules are black. Print always uses this layout, whether or not JavaScript ran.

## Behavior

With JavaScript, the tabbed layout is drawn by CSS on first paint, so the page
does not shift when the client component mounts. The tab buttons stay disabled
until then. Mounting applies the
[WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):

- `role="tablist"`, `role="tab"` with `aria-selected` and `aria-controls`, and
  `role="tabpanel"` with `aria-labelledby`
- Selection follows focus (automatic activation): Left and Right arrows move to
  the previous and next tab, wrapping around, and Home and End move to the
  first and last tab; the page scrolls just enough to show the tab list, as it
  would for any focused element. Clicking a tab selects it. Selecting the
  selected tab again (such as with Home on the first tab) still scrolls it
  into view.
- Only the selected tab is in the tab order (roving `tabindex`). Tab moves
  from it to its panel, which is focusable.
- A touch or pen anywhere on the tab list takes hold of the indicator as soon
  as it goes down: the tab under it is selected, and the indicator follows it
  until it lifts, wherever it moves, selecting each tab its center crosses.
  In a tab list too long for its track, holding the finger within about a
  scroll button and its fade of either end scrolls the track that way (faster
  nearer the end, up to 600px per second), and the indicator keeps following
  the finger through the tabs that come into view, as it does if a smooth
  scroll is still moving the tabs when the finger goes down. The indicator
  updates at most once per frame, and once more as the finger lifts if a move
  is not yet drawn. The first pointer click within 400ms of a drag lifting is
  ignored, since the drag already selected the tab under the finger; keyboard
  clicks are never ignored. The appearance pickers share this touch handling
  (`src/touch-drag.ts`). The tab list has `touch-action: none` (and `touchmove` is canceled
  during a drag), so a touch that starts there never scrolls the page. A touch does not
  move focus, so no focus ring appears, unless a tab already had focus. The
  mouse selects only by clicking.
- Inactive panels are `hidden="until-found"`, so the browser's find-in-page
  can reveal them; a match selects its tab.
- A page opened from a search result selects the tab containing the first
  search highlight (see [Search Highlighting](search-highlighting.md)).
- When the URL fragment targets an element in an inactive panel, on load or on
  `hashchange`, its tab (and any enclosing tabs) is selected and the target is
  scrolled into view. Table of contents links into tabs work this way, and so
  does following a link to the fragment already in the URL. When navigation
  restores a saved scroll position (Back, Forward, or a dev server refresh),
  the tab is selected but the page keeps that position.

## Appearance

The tab list looks and behaves like the appearance pickers
([font](font-picker.md) and [contrast](contrast-picker.md)), which share its
colors, hover and press states, and touch dragging: a pill-shaped track on the secondary
background, padded by 6px, with a fully round border radius. Tabs are
borderless pills with secondary text in the small font size, like other
buttons. The active tab is filled with the page background and ringed by a 2px
border in the secondary foreground color, like the pickers' current option, so
a strip of the track stays visible around it, even at either end. A focused
tab's outline is drawn just outside the ring, still inside the track.
Code in an unselected tab's label, on the track, has no background and a 1px
border in the label's text color. The selected tab is on the page background,
so code in its label is a chip.

The tab list is centered above the panel box. The box has a 3px border in the
secondary background color (the track's color). Panels are padded by
`--tabs-padding` (12px). The rounded boxes inside a panel, code blocks
(`<pre>`) and a stepper's buttons, have a `--tabs-content-radius` of
`var(--border-radius)` (12px). The box's border radius,
`--tabs-radius`, is `--tabs-content-radius + --tabs-padding + 3px` (27px by
default), so its corners are concentric with those boxes, which sit a panel's
padding inside the border. Code blocks in a panel, at any depth, use this
radius instead of the usual `--mono-border-radius`. Every tab group has this
box, stepper or not. Its
top edge runs along the tab list's horizontal midline and stops
`var(--gap)` short of the tab list on each side, so the border never touches
it. Because the lower half of the tab list sits inside the box, panels have
half the usual top padding (except in print).

Tabs always stay on one row. A tab list wider than the panel scrolls
horizontally, with its scrollbar hidden. The track draws the pill and holds
the tab list between two scroll buttons, rendered `hidden` at build time and
shown by the client component. While the tabs do not fit the track, a round
button the size of a tab, with a chevron in the secondary foreground color,
sits at each end of the track beside the tabs (never over them). Both stay
shown while the tabs overflow, so the tabs between them keep their width; the
button at the end already reached is disabled. The tabs fade out over 1.5em
toward an end with tabs hidden past it. Clicking a button scrolls the tabs
smoothly (instantly with reduced motion) by their visible width less about
two tab heights. The buttons are `aria-hidden`, out of the tab order, and do
not take focus when clicked:
keyboard users move through the tabs with the arrow keys, and selecting a tab
by any means scrolls it into view, clear of the fades. When the tabs or the
track change size (the window resizing, a phone turning, fonts loading), the
selected tab is scrolled into view the same way, instantly, unless a drag is
scrolling the track. Either way the tabs scroll only as far as needed, so a
tab already in view does not move. Every scroll the
component asks for is clamped to the tabs' scroll range, since iOS Safari
animates a smooth scroll past an end into its overscroll area and stops there.
The track and buttons are hidden in print.

Before the client component mounts, the selected tab draws its own fill. Once
mounted, an indicator (an `aria-hidden` element inside the tab list) draws it
instead and slides to the newly selected tab, resizing to fit its label, over
200ms with the appearance pickers' easing. The new panel replaces the old one
at once, and the panel box takes its height at once. Neither is animated,
since animating them would lay out or repaint the page on every frame.

The indicator is drawn as two round end caps over a middle strip, and moving
or resizing it changes only their transforms, so browsers animate it without
laying out the page. The middle strip is two solid rectangles (the ring color
under the fill), not a strip with borders, since Chromium blurs the borders of
scaled content while it animates. The indicator's position and size are
snapped to device pixels, so no edge shifts by a pixel when the browser moves
it to a layer of its own to animate it.

When a touch goes down on the tab list, the indicator slides onto the tab under
it (or the nearest tab), exactly as if the tab were clicked, so lifting the
finger without moving it does not slide it again. While dragged, it follows
the finger from there
without a transition, clamped between the first and last tabs, and its width
blends between the widths of the two tabs on either side of its center. A
long tab list scrolls to keep it in view. The tab where the touch went down
does not show the press colors once it is no longer selected. On release, the
indicator slides onto the selected tab like any other selection, and the
release does not select the tab where the touch went down.

The indicator does not slide when the user prefers reduced motion, nor for
tabs selected while the page loads (such as by the URL's target), and layout
changes such as fonts loading or an enclosing panel being shown move the
indicator instantly. Tabs are drawn above the indicator and have no
background of their own while hovered or focused, so none covers it as it
slides.

## Steppers

A group whose labels are numbered `1.`, `2.`, `3.`, ... in order, each number
followed by a space or tab, is a stepper: a sequence of steps to follow rather
than alternatives. There is no other syntax:

```
[1. Install|

Install the package.

]
[2. Configure|

Edit the configuration file.

]
```

A stepper needs at least two tabs. A group with a single numbered tab, numbers
that skip or do not start at 1, zero-padded numbers (`01.`), `1)` labels, a
number without a space after the period (`1.A`), or any unnumbered tab is a
plain tab group. Labels keep
their numbers in the tab buttons and panel labels.

A stepper behaves exactly like other tabs: the same tab list, indicator,
keyboard and touch handling, find-in-page, search highlighting, and URL
fragment handling. Arrow keys still wrap around. A stepper also has
**← Back** and **Next →** buttons.

### Generated HTML

The group has the extra class `tabs-stepper`. After the last panel, inside
`.tabs-panels`, one shared nav holds both buttons:

```
<div class="tabs tabs-stepper" id="tabs-1">
...
<div class="tabs-panels">
<div class="tabs-panel" id="tabs-1-panel-1" data-selected="">...</div>
<div class="tabs-panel" id="tabs-1-panel-2">...</div>
<div class="tabs-step-nav" data-pagefind-ignore="">
<button type="button" class="tabs-step tabs-step-back" disabled="" hidden=""><span aria-hidden="true">←</span> Back</button>
<button type="button" class="tabs-step tabs-step-next" disabled="">Next <span aria-hidden="true">→</span></button>
<span class="tabs-step-status visually-hidden" role="status"></span>
</div>
</div>
</div>
```

The arrows are `aria-hidden`, so the buttons are named "Back" and "Next". The
empty, visually hidden `role="status"` element announces the step that Back or
Next reaches. The nav is excluded from the search index. The buttons stay disabled until the
client component mounts. Back starts hidden, since the first step is
selected.

### Behavior

- Back and Next select the step before or after the selected one, exactly as
  if its tab were clicked: the indicator slides and the panel is replaced at
  once. The URL does not change.
- Both buttons have `aria-controls` listing every panel. Screen readers
  announce the step that Back or Next reaches: the status element's text
  becomes the step's tab label (such as "2. Configure"). Selecting a step
  another way empties it, since the tab itself is announced then, and screen
  readers speak a status only when its text changes, so a step reached again
  with Back or Next is still announced.
- Back is hidden on the first step and Next on the last, however the step was
  selected.
- After a step changes, the page scrolls just enough to show the tab list
  (as the arrow keys do), such as after clicking Next at the bottom of a step
  taller than the viewport. The page does not move if the tab list is already
  in view.
- Focus stays on the clicked button. A focused step button that is hidden
  (Next on the last step, Back on the first), however the step was selected
  (a tab click, find-in-page, the URL's target), passes focus to the other
  button, so focus never drops to the page. Focus moves only if the hidden
  button had it, and never when a touch or pen pressed a step button, since
  Safari would draw a focus ring around a button focused by script. A click
  with no `detail` (from the keyboard) always counts as a keyboard click. A
  pointer click's type is taken from its own `pointerdown` on the button, not
  from the click, since iOS Safari 18.2 reports a touch's click as a mouse's.

### Appearance

The buttons use the default button style, with `touch-action: manipulation`
so tapping Next quickly never zooms the page, and no tap highlight. Before the
client component mounts, they are disabled but not dimmed, so they do not
change when it mounts. The nav is in the panel box's bottom corners, below the panel's
own bottom padding and lined up with its content, with Back on the left and
Next on the right. Next stays on the right when Back is hidden. A focused
panel's outline has square bottom corners, since the nav sits below it.

### Without JavaScript and in print

The nav is hidden. Every step is shown, stacked under its numbered label, as
for any tab group, so the steps read in order. Print always uses this layout.
