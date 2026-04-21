---
parentLabel: Lectures
parent: /lectures/index.html
title: Lecture 1
description: An example lecture page.
author: alex
---

Here is a sample description of the topics covered at the first lecture.

The value of `vars.foobar` is <%= vars.foobar %>.

You can add any variables you want to the `site.dev.json` and `site.prod.json`
files under the `"vars"` property and access them using Lodash template syntax
from Markdown files, HTML files, and source code. (Lodash template subtitution
only works in source code files whose extension is listed in
`extensionToShikiLanguage`.)

## Slides

* [`lecture1.pdf`](./lecture1.pdf)

!!! note
When `feature.search` is `true` in the site config and MuPDF is installed
(when the `mutool` command is available), the search results can contain
references directly to specific PDF pages. Try searching "hello world" and
you should see a result for page 2 of `lecture1.pdf`.
!!!


## Code

* [`Rectangle.java`](./Rectangle.java) (an example of a code page)
* [`demo.py`](./demo.py) (another example of a code page)
* [`Pair.java`](./Pair.java.html) (an example literate Java page)
  - [A direct link](./Pair.java) to the source code

!!! note
Code pages and code blocks are highlighted by [Shiki](https://shiki.style).
A source code file's extension must be present in the config file under
`extensionToShikiLanguage` to be converted into a code page.
!!!

## Review questions

??? question What is a computer?

A thing that computes.

???
