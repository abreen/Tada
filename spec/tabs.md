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
<div class="tabs-list">
<button type="button" class="tabs-tab" id="tabs-1-tab-1" data-selected="" disabled="">Java</button>
<button type="button" class="tabs-tab" id="tabs-1-tab-2" disabled="">Python</button>
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

The tab list is hidden. Every panel is shown, stacked inside one bordered box,
each under its label and separated by a thin rule. Print always uses this
layout, whether or not JavaScript ran.

## Behavior

With JavaScript, the tabbed layout is drawn by CSS on first paint, so the page
does not shift when the client component mounts. The tab buttons stay disabled
until then. Mounting applies the
[WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):

- `role="tablist"`, `role="tab"` with `aria-selected` and `aria-controls`, and
  `role="tabpanel"` with `aria-labelledby`
- Selection follows focus (automatic activation): Left and Right arrows move to
  the previous and next tab, wrapping around, and Home and End move to the
  first and last tab. Clicking a tab selects it.
- Only the selected tab is in the tab order (roving `tabindex`). Tab moves
  from it to its panel, which is focusable.
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

The tab list looks like the appearance pickers ([font](font-picker.md) and
[contrast](contrast-picker.md)): a pill-shaped track on the secondary
background, padded by 6px, with a fully round border radius. Tabs are
borderless pills with secondary text in the small font size, like other
buttons. The active tab is filled with the page background and ringed by a 2px
border in the secondary foreground color, like the pickers' current option, so
a strip of the track stays visible around it, even at either end. A focused
tab's outline is drawn just outside the ring, still inside the track.

The tab list is centered above the panel box. The box has a 1px border in the
secondary foreground color and the same border radius as `<details>` in
content. Its top edge runs along the tab list's horizontal midline and stops
`var(--gap)` short of the tab list on each side, so the border never touches
it. Because the lower half of the tab list sits inside the box, panels have
half the usual top padding (except in print). A tab list wider than the panel
scrolls horizontally inside its track.

Before the client component mounts, the selected tab draws its own fill. Once
mounted, an indicator (an `aria-hidden` element inside the tab list) draws it
instead and slides to the newly selected tab, resizing to fit its label, over
200ms with the appearance pickers' easing. At the same time, with the same
duration and easing:

- The panel box's height changes smoothly from the old panel's height to the
  new one's, clipping the panels' content until it finishes.
- The panels crossfade: the old panel stays shown over the new one, `inert`
  (so it takes no clicks or focus and is hidden from assistive technology),
  and fades out as the new panel fades in. Then it is hidden as usual. Like
  a view transition's crossfade, the two panels blend with
  `mix-blend-mode: plus-lighter` in an isolated panel box, so content in the
  same place in both, such as a code block's background, does not dim
  halfway through.

Selecting another tab midway continues from the box's current height and the
panels' current opacity.

Neither animates when the user prefers reduced motion. Tabs selected while the
page loads (such as by the URL's target) do not animate either, and layout
changes such as fonts loading or an enclosing panel being shown move the
indicator instantly. Tabs are drawn above the indicator and have no
background of their own while hovered or focused, so none covers it as it
slides.
