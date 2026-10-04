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

This layout accounts for the fixed header, optional site banner, page heading,
and responsive table of contents. On desktop the TOC sits beside the body and
remains sticky, with a viewport-based maximum height and internal scrolling.
On narrow screens the TOC precedes the body on default and literate pages;
code-page TOCs remain hidden. The two-column desktop layout and the desktop
maximum content width apply only to screens: printed output hides the TOC and
gives the page heading and body the full printable width, with no empty TOC
column or centering margins.

During client-side navigation, the group uses a stationary View Transition
layer showing only the incoming snapshot. Its appearance controls are
synchronized before that snapshot is captured, preventing disabled/default
states from flashing. If navigation changes the group's layout position
(for example, between a short and long page), it takes its destination position
without an animated slide or resize.

Positioning uses CSS and works with JavaScript disabled. Appearance switches
remain disabled until mounted. The entire bottom group is hidden in printed
output and during slide presentation, where the viewport-filling minimum
height is also removed.
