## Problem 2 # The second example problem

Here's the `_pr2.md` partial. If we use `include()` here, the path is resolved
relative to this file, **not** the page or partial that included us.

<%= include('_foobar.html') %>
