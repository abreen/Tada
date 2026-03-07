title: Markdown Examples
description: Examples of Markdown syntax supported by Tada.
toc: true
author: alex

!!! note
This page does not appear in the search results because no links exist to it
from any other pages on the site.
!!!

Markdown and HTML files in the `content/` directory
must contain ["front matter"][front-matter] (YAML-formatted metadata).
For example, this file's first five lines look like this:

```text
title: Markdown Examples
description: Examples of Markdown syntax supported by tada.
toc: true
author: alex
```

This page contains a table of contents because the front matter
contains `toc: true`.

- On small screens, the table of contents appears after the `<h1>` and before
the `<main>` element.
- On larger screens, it floats on the side of the screen.

Note that the table of contents contains more than just headings, but
also alerts (notes and warnings) `<hr>` elements.

---

## Basic syntax

<!---
This HTML comment starting with three hyphens is removed during the build
and does not appear in the HTML source for the page.
-->

Tada uses [MarkdownIt][markdown-it] to render Markdown files, which is
[standards-compliant][commonmark]. It supports all the features of Markdown
that Presto did.

Here is *italic* and **bold** and `monospace` and ***italic-and-bold***!

- Milk
  - Eggs
    - Orange juice
      - Ice cream
        - Coffee

1. Alpha
   1. Bravo
      1. Charlie
         1. Delta
            1. Echo

### Code blocks

There are two ways to get a code block. You can indent 4 or more spaces from
the current indentation level (same as Presto):

    public static void main(String[] args) {
      System.out.println("foobar");
    }

You can also use three backticks without needing to indent, and it supports
specifying the name of a language for syntax highlighting, like this:

    ```java
    public static void main(String[] args) {
      System.out.println("foobar");
    }
    ```

Which is highlighted using [Shiki][shiki] at build time:

```java
public static void main(String[] args) {
  System.out.println("foobar");
}
```

* Don't forget to close code blocks with another three backticks.
* Code highlighting only works when you include the language name (e.g., `java`)
  after the opening backticks.

---

### Tables

By default, MarkdownIt supports [the table syntax from GitHub "flavored" Markdown][flavored].

Here's a basic table:

```markdown
| Syntax | Description  |
| ------ | ------------ |
| Cell   | Another cell |
| Foo    | Bar          |
```

You can omit the starting and ending vertical pipes, and the pipes don't have
to perfectly match on every line:

```markdown
Syntax | Description
--- | ---
Cell | Another cell
Foo | Bar
```

This results in:

Syntax | Description
--- | ---
Cell | Another cell
Foo | Bar


### Internal and external links

The syntax for links is unchanged from Presto. However,

- internal links are prepended with `site.basePath` (e.g., `<a href="/other-page">`
  becomes `<a href="/base/path/other-page">`)
- external links (links whose domain is not one of `site.internalDomains`) are
  automatically given `target="_blank"` and special styling

See `config/site.dev.json` and `config/site.prod.json` to change `site.basePath`
and `site.internalDomains`.


## Additional syntax

!!! note Headings are links
All headings are clickable. When you click them, the URL is updated with a
unique hash that links back to the heading.
!!!


### Heading subtitles

Write headings using

```
## Heading # Subtitle
```

to render a subtitle inside the heading, like this:

#### Course Logistics # Week 1 Overview

The subtitle is given special text styling, and a horizontal line is added
after the heading. The special text styling for the subtitle also appears in
the table of contents.


### Footnotes

Footnotes follow standard MarkdownIt syntax. This sentence references a
footnote.[^example-footnote]


### Definition lists

Definition lists are supported using the same syntax as Presto:

Stack
: Last-in first-out collection.

Queue
: First-in first-out collection.

Binary tree
: Hierarchical structure where each node has up to two children.

Each term (bolded) of the definition list gets its own `id` attribute, like
headings, so you may [link directly to a definition](#binary-tree):

```text
/example.html#binary-tree
```


### Collapsible section

Use

```
<<< details Title of *collapsible*
Here's the content that is visible when expanded.
<<<
```

to create a collapsible section (the `<details>` element):

<<< details Title of *collapsible*
Here's the content that is visible when expanded. (When the page is being
printed, all collapsibles are automatically opened.)
<<<


### Alerts

Brightly colored boxes that call attention to specific warnings or information.
The `note` variation is blue and is styled with an information icon.
The `warning` variation is yellow and styled with a warning triangle.

!!! note
Keep this information in mind.
!!!

!!! warning
Beware of this rule.
!!!

You can specify a custom title:

```markdown
!!! warning Double-check your answers
No partial credit is offered for these questions, double-check your answers!
!!!
```

!!! warning Double-check your answers
No partial credit is offered for these questions, double-check your answers!
!!!

Like with headings and definition list terms, custom alert titles have an `id`
attribute which allows you to link directly to them. They also appear in the
table of contents alongside headings.


### Q&A section

Use

```markdown
??? question What is a base case? Give an example.

The <dfn>base case</dfn> is the simplest version of the problem that can be
solved directly without any further recursive calls. For recursive methods that
process strings, the base case is the empty string.
???
```

to create a Q&A section whose answer is hidden by default and can be clicked
to reveal:

??? question What is a base case? Give an example.
The <dfn>base case</dfn> is the simplest version of the problem that can be
solved directly without any further recursive calls. For recursive methods that
process strings, the base case is the empty string.
???


### Generic section

Break up a long page by introducing a `<section>` (a standard HTML 5 element)
which must start with a heading. Generic sections are displayed with a slightly
different background.

Use

```markdown
::: section

### Submitting your work

Here are the steps to follow when you are ready to submit your work for
this problem set.

...
:::
```

to create:

::: section

### Submitting your work

Here are the steps to follow when you are ready to submit your work for
this problem set.

1. Step one
2. Step two
3. Step three
4. Step four

Email the files you changed to `<%= staffEmail %>`.

:::

---

## Additional features

These features aren't Markdown-specific, but are included here for reference.

### Time zone chooser

Allows the user to see times in their local time zone.

!!! note
Look at the source code for this file to see how to insert it.
!!!

<%= timezoneChooser %>

Wrap your times in `<time datetime="...">` elements and they will be updated
when the user makes a time zone selection.

Use

```html
Here's an example time: <time datetime="17:30">5:30 pm</time>
```

To produce:

Here's an example time: <time datetime="17:30">5:30 pm</time>

Time ranges work since the `datetime` attribute should be specified in 24-hour
time, like this:

Here's a time range:
<time datetime="12:45">12:45</time>--<time datetime="13:45">1:45 pm</time>

- When a `<time>` element is adjusted,
  * the appearance of the element changes slightly to indicate it was updated,
  * hovering over the text produces a tooltip telling the user the original time
    and time zone, and
  * if the time adjustment crosses a day boundary, *(next day)* or *(prev. day)*
    is shown after the adjusted time.
- Whichever style is used for AM/PM (`am`, `a.m.`, `AM`, etc.) is maintained
  when the time is adjusted.
- The selected time zone is saved in the browser's storage for the site, so
  it will persist through refreshes, navigations, and browser restarts.
- On any page where you use a `<time>` element, you should include the
  time zone chooser somewhere so the user can adjust it.
- The default time zone is set in the config file under `site.defaultTimeZone`.
- With JavaScript disabled, the chooser is hidden and a fallback message
  is shown (e.g., *Times shown in ET.*).



[^example-footnote]: Footnotes render inside a numbered list at the bottom of
the page.

[front-matter]: https://www.npmjs.com/package/front-matter
[markdown-it]: https://markdown-it.github.io/
[commonmark]: https://spec.commonmark.org/
[flavored]: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables
[presto]: https://github.com/abreen/presto
[shiki]: https://shiki.style/
