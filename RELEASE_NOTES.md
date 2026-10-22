# Release notes

## Unreleased

- Fixed: Slide annotations line up with the pointer when a scrollbar gutter is reserved

## 1.22.6

- Changed: Page transitions use one consistent timing and keep the background steady
- Documentation updates

## 1.22.5

- Changed: Layout and centering improvements; the sidebar is sticky again

## 1.22.4

- Fixed: `<noscript>` content no longer appears after client-side navigation

## 1.22.3

- Added: Custom elements can be rendered at build time with script renderers
- Changed: A page's scripts load before it is shown during navigation
- Changed: The time zone example in `tada init` is now a custom element
- Fixed: The document index no longer flickers during navigation

## 1.22.2

- Changed: Document index and TOC sit side by side on portrait tablets
- Changed: Layout no longer jumps at wide screen sizes
- Fixed: Small layout and border issues on literate and slides pages

## 1.22.1

- Added: New type scale using Inter
- Changed: Document index and TOC stay in a sticky sidebar
- Changed: Breadcrumbs no longer repeat the page title
- Changed: Proofread tooltips show the rule name
- Fixed: Inline code styling in pressed tabs and pagination links

## 1.22.0

- Added: Wikilinks
- Added: Document index
- Added: Proofreading in watch mode (Harper), with dialect and rule options
- Changed: Styling for code page titles and pagination links
- Removed: `details` classes

## 1.21.2

- Changed: More stable scroll behavior and better focus outlines on `<details>`
- Fixed: Highlights clear correctly

## 1.21.1

- Added: Stepper mode for tabs
- Changed: Tabs styling refined

## 1.21.0

- Added: Tabs
- Added: Custom JavaScript and Sass
- Changed: Tabs and appearance pickers share one design
- Changed: Simpler `{{ name }}` variable syntax (Lodash removed)
- Removed: Time zone chooser feature

## 1.20.2

- Changed: Simpler navigation transitions

## 1.20.1

- Changed: Styled scrollbars
- Changed: Floating TOC looks and behaves better

## 1.20.0

- Changed: Better link text colors and inline code appearance
- Removed: Some rarely used custom syntax

## 1.19.5

- Changed: Superlink labels may not contain autolinks or raw anchors
- Security: Updated KaTeX

## 1.19.4

- Added: Superlinks

## 1.19.3

- Changed: TOC icons are aligned
- Fixed: Scroll restoration in Safari
- Fixed: Watch mode handles public folders replaced by files

## 1.19.2

- Changed: Footer and pickers fade during navigation
- Fixed: Links to anchors highlight and scroll correctly

## 1.19.1

- Added: Back-to-top button on long pages
- Changed: Cursor shows progress during slow page loads
- Changed: Dev server can use any free port
- Fixed: Accessibility fixes for search and hidden answers
- Fixed: Various link and anchor fixes

## 1.19.0

- Added: A single emoji can be used as the site symbol
- Changed: New sticky-note style; styled lists and questions use weight 600
- Fixed: Footer font size

## 1.18.5

- Changed: Improved icons
- Fixed: Print styles

## 1.18.4

- Changed: Header border removed; more header refinements
- Fixed: Footnotes title is no longer a heading

## 1.18.3

- Changed: Dynamic header and tint tweaks

## 1.18.2

- Fixed: Breadcrumb, avatar, and mobile diagram layout issues

## 1.18.1

- Changed: `parent`/`parentLabel` replaced with breadcrumbs

## 1.18.0

- Added: Custom logo and favicon
- Added: Font tuning without replacing the bundled fonts
- Changed: Faster client-side navigation
- Changed: Watch mode was made more reliable and efficient
- Fixed: Literate Java and TOC alert fixes
- Fixed: Footer stays at the bottom of the page

## 1.17.1

- Changed: Watch mode recovers from failed rebuilds
- Fixed: Many fixes to navigation, search, code pages, tables, time zones, and deploy output

## 1.17.0

- Internal test improvements

## 1.16.13

- Changed: Smoother animations; better Q&A answer appearance

## 1.16.12

- Changed: Monospace font is now Courier Prime

## 1.16.11

- Changed: Header has a border and scrim

## 1.16.10

- Added: Header animations
- Fixed: Accessibility

## 1.16.9

- Changed: Smoother font switching

## 1.16.8

- Fixed: Printed Q&A answers, text wrapping, and header layout
