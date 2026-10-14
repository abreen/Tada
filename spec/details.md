# Details

Authors can write raw HTML `<details>` elements in Markdown or HTML content to
hide content until a reader opens it:

```html
<details>
<summary>More info</summary>

Content shown when the details element is open.

</details>
```

## Appearance

A details element in the page content is drawn as a square-cornered box with a
border in the foreground color. The summary spans the full width of the box, so its
whole row is clickable. While anything inside the box has focus, the box gets
an outline in the theme color.

Content inside a details element is not listed in the
[table of contents](table-of-contents.md). Search highlights in a closed details
element are skipped (see [Search Highlighting](search-highlighting.md)). Before
printing, every details element is opened, and then closed again afterwards if
it was closed.

## Info and warning icons

Add the `info` or `warning` class to show the matching icon in the summary:

```html
<details class="warning">
<summary>Known issues</summary>

Content shown when the details element is open.

</details>
```

The icon is the 20px `info-compact` or `warning-compact` icon (see
[Icons](icons.md)), drawn in the foreground color at the right end of the
summary. It sits one details padding in from the box's right border and is
centered on the summary's first line. The summary keeps room for the icon, so
long summary text wraps before it. Hovering or activating the summary changes
the text color but not the icon. The icon stays on the summary while it is
stuck (see below). These classes only add the icon; the box keeps its usual
border and background.

## Tall details elements

On screen, an open details element that is not nested in another details
element keeps its summary in view, so a reader who scrolls through a long body
can still close it:

- While the top of the box is scrolled above the viewport (below the fixed
  header, when there is one), the summary and the box's top edge stick
  to the top of the viewport. The stuck summary travels down to the box's
  bottom border, so once the body has scrolled past, the box is as tall as a
  closed one; the summary then scrolls away with it. (Browsers without
  `::details-content` keep the bottom padding below the summary.)
- The body scrolls with the page, under the stuck summary. Wheel and touch
  scrolling over the box scroll the page.
- Body text fades out as it passes under the stuck summary. The fade appears
  once the summary sticks and disappears before the summary reaches the bottom
  of the box, so a details element that is not stuck looks the same as before.
- Fragment links and search highlights scroll their target clear of the stuck
  summary.
- The stuck summary and its fade use the `--details-bg-color` custom property,
  which is the page background by default. Note and warning alerts set it to
  their own background, so a details element inside one matches it.

The fade uses scroll-driven animations (a view timeline on the details
element). Browsers without them show the stuck summary without a fade.

Closing a details element from its stuck summary would collapse the body
above the summary and carry the summary off screen. With JavaScript, the
`details` client component closes it and then scrolls the closed details to
where fragment links land: below the header, with the page's scroll padding
above it. Clicks on interactive content inside a summary
(such as links, buttons, form controls, and labels), clicks that another
listener already prevented, and details elements in the header are left
alone. Without JavaScript, the browser
closes the details element normally.

Nested details elements, and details elements in print, do not stick.
