---
title: Home
description: The home page for <%= site.title %>.
author: alex
published: 2026-03-20
toolName: Tada
---

## Welcome

This is an example site built with <%= page.toolName %>.


## Getting started

Edit the files in `content/` to add your own pages. To configure the nav,
update `nav.json`. Update `authors.json` with your information, or delete it
if you won't use the `author` front matter field.

See the [Markdown examples page](/markdown.html) for syntax examples.

!!! note
For more documentation, see the [GitHub page](https://github.com/abreen/Tada).
<% if (vars.testCoveragePercent) { %>
- <%= vars.testCoveragePercent %>% of <%= page.toolName %>'s code is covered by
  automated tests (unit tests, [Playwright](https://playwright.dev/) browser
  tests, and functional, black-box tests which exercise functionality using the
  CLI). See [the test coverage metrics](<%= vars.testCoverageUrl %>).
- <%= page.toolName %>'s features and behavior are
  [documented in Markdown](https://github.com/abreen/Tada/tree/main/spec) for
  easy reading by people and LLMs.
<% } %>
!!!
