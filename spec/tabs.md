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

The panel box has a 1px border in the secondary foreground color and the same
border radius as `<details>` in content. The border continues up around the active tab, which shares the
panel's background and covers the panel's top border beneath it; its sides
curve out into the panel's top border with small concave corners, as wide as
the gap between tabs (the first tab's left side runs straight into the panel's
left border). Every tab rests on the panel's
top border with rounded top corners and a flat bottom. The first tab is flush
with the panel's left border, so the panel's top-left corner is square.
Inactive tabs are borderless buttons on the secondary background with
secondary text. A tab list wider than the panel scrolls
horizontally.

Switching tabs has no animation or transition.
