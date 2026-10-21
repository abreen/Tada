# Page Layout

Default, code, and literate pages group the optional Tada attribution footer
and appearance pickers in one build-time `.page-bottom` div within the main
content column. The footer appears above the pickers. The group is omitted
when both `features.footer` and `features.pickers` are disabled; either feature
can appear independently.

On short pages, the layout fills the available viewport height and pushes this
group to the bottom, leaving unused space between the content and the group.
The page retains 2rem of bottom padding and at least 6em of separation between
content and the group. On long pages, the group follows the content in normal
flow and scrolls with the page.

This layout accounts for the header, optional site banner, page heading,
and responsive table of contents. Page content, the sticky TOC, and fragment
scroll positions leave room for the header only while it is fixed; a static
header (see [Navigation](navigation.md#without-a-nav-file)) is part of the page
flow and reserves no extra space. On screens at least 900px wide, a page with a
TOC or document index puts it in a sticky sidebar beside the body, with a
viewport-based maximum height and internal scrolling; the index is above the
TOC and each scrolls on its own. The page heading spans the sidebar and body,
so the sidebar starts below it, scrolls with the page, and sticks `var(--gap)`
below the header once it reaches it. Once stuck, the sidebar is never taller
than the viewport; before the page scrolls, its end can sit below the viewport
by up to the heading's height.

The sidebar and body sit between two equal outer grid columns, so together
they are centered; a page without a sidebar centers the body alone. As the
window narrows, the outer columns shrink away first, then the body, so a page
without a sidebar resizes smoothly at every width. Centering uses the
container's own width rather than a viewport breakpoint, so it does not jump as
a scrollbar appears.

There is one breakpoint, 900px (`$breakpoint` in `src/_mixins.scss`). Below it
everything stacks in one column: the heading, the document index, the TOC (a
boxed block on default and literate pages; hidden on code pages), the body,
[two-column layouts](markdown.md#two-column-layout), and literate code and its
output. At 900px and wider the sidebar sits beside the body and those pairs sit
side by side; two-column layouts also stay side by side in print. The body is
at most `--main-width` wide: 876px, the breakpoint less the container's padding,
set on the container beside that padding. So a window narrower than the
breakpoint fills the body edge to edge with no extra margin.

Everything in the body uses the body's width; long code lines scroll. The
sidebar layout and the width cap apply only to screens: printed output hides
the TOC and document index and gives the page heading and body the full
printable width, with no empty TOC column or centering margins.

During client-side navigation, the group uses its own View Transition layer.
Its appearance controls are synchronized before the incoming snapshot is
captured, preventing disabled/default states from flashing. When the group is
on screen on both pages, the layer is stationary and shows only the incoming
snapshot at its destination position, without an animated slide or resize.
When it is on screen on only one page (for example, between a short page and
the top of a long page), it fades out or in where it is (see
[Client-Side Navigation](client-side-navigation.md)).

Positioning uses CSS and works with JavaScript disabled. Appearance switches
remain disabled until mounted. The entire bottom group is hidden in printed
output and during slide presentation, where the viewport-filling minimum
height is also removed.
