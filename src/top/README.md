# The `top` component

Show a floating "back to top" button on long pages once the reader has scrolled
well down the page, and keep it visible until they are back above that point.

- The page must be at least 3 viewports tall; shorter pages never show it.
- It shows once the scroll position passes 1.5 viewports or 25% of the
  scrollable distance, whichever is farther.
- Visibility is recalculated on scroll and on resize.
