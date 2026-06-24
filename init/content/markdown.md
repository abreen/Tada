---
title: Markdown Examples
description: Examples of Markdown syntax supported by Tada.
author: alex
published: 2026-03-20
toc: true
---

Markdown and HTML files in the `content/` directory
must contain ["front matter"][front-matter] (YAML-formatted metadata).
For example, this file's first five lines look like this:

```text
---
title: Markdown Examples
description: Examples of Markdown syntax supported by Tada.
toc: true
author: alex
---
```

This page contains a table of contents because the front matter
contains `toc: true`.

- On small screens, the table of contents appears after the `<h1>` and before
the `<main>` element.
- On larger screens, it floats on the side of the screen.

Note that the table of contents contains more than just headings, but
also alerts (notes and warnings) `<hr>` elements.

## Basic syntax

{/*
This native MDX comment is removed during the build and does not appear in the
HTML source for the page.
*/}

Tada uses [MDX 3][mdx] to render `.md`, `.markdown`, and `.mdx` files. MDX
combines [CommonMark][commonmark] with JSX components and JavaScript
expressions. Tada evaluates it at build time and emits static HTML.

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

Use three backticks for a code block. Add a language name for syntax
highlighting:

````text
```java
public static void main(String[] args) {
  System.out.println("foobar");
}
```
````

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

Tada supports [the table syntax from GitHub-flavored Markdown][flavored].

Here's a basic table:

```
| Syntax | Description  |
| ------ | ------------ |
| Cell   | Another cell |
| Foo    | Bar          |
```

You can omit the starting and ending vertical pipes, and the pipes don't have
to perfectly match on every line:

```
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

See `site.dev.yaml` and `site.prod.yaml` to change `site.basePath`
and `site.internalDomains`.


## LaTeX

$\LaTeX$ support is implemented via [KaTeX](https://katex.org/). The standard
dollar sign-based syntax is supported. Wrap inline math in single `$`,
or use `$$` for a math block.

Here's an example: selection sort performs $O(n^2)$ comparisons. And to
demonstrate a block, here's the exact number of comparisons:

$$
(n-1) + (n-2) + \dots + 1 = \sum_{i=1}^{n-1}i
$$


## Additional syntax

<Note title="Headings are links">
All headings are clickable. When you click them, the URL is updated with a
unique hash that links back to the heading.
</Note>


### Heading subtitles

Use the `Subtitle` component inside a heading:

```
## Heading <Subtitle>Subtitle</Subtitle>
```

to render a subtitle inside the heading, like these:

## Course Logistics <Subtitle>Week 1 Overview</Subtitle>

### Course Logistics <Subtitle>Week 1 Overview</Subtitle>
*20 points, 5 points per part*

#### Course Logistics <Subtitle>Week 1 Overview</Subtitle>
*20 points, 5 points per part*

The subtitle is given special text styling, and a horizontal line is added
after the heading. The special text styling for the subtitle also appears in
the table of contents.


### Footnotes

Footnotes use the standard Markdown syntax. This sentence references a
footnote.[^example-footnote]


### Definition lists

Definition lists are supported using the same syntax as Presto:

Stack
: Last-in first-out collection.[^footnote-2]

Queue
: First-in first-out collection.[^footnote-3]

Binary tree
: Hierarchical structure where each node has up to two children.

Each term (bolded) of the definition list gets its own `id` attribute, like
headings, so you may [link directly to a definition](#binary-tree):

```
/example.html#binary-tree
```


### Collapsible section

Use

```
<Details summary={<>Title of <em>collapsible</em></>}>
Here's the content that is visible when expanded.
</Details>
```

to create a collapsible section (the `<details>` element):

<Details summary={<>Title of <em>collapsible</em></>}>
Here's the content that is visible when expanded. (When the page is being
printed, all collapsibles are automatically opened.)
</Details>


### Alerts

Brightly colored boxes that call attention to specific warnings or information.
The `note` variation is blue and is styled with an information icon.
The `warning` variation is yellow and styled with a warning triangle.

<Note>
- Here's a bullet point
- Here's another point
- Here's the final bullet point.

An example of `monospace` text.

1. Ordered list item one
2. Ordered list item two
3. Ordered list item three
</Note>

<Warning>
Beware of this rule.

A time zone chooser for testing styles (see the "time zone chooser" section
below):

<TimeZoneChooser />

A `<time>` element for testing styles: <time datetime="15:00">3 pm</time>

Testing [internal link style](./markdown.html)  
Testing [external link style](https://www.google.com)

Testing <dfn>definition</dfn> style
</Warning>

You can specify a custom title:

```
<Warning title="Double-check your answers">
No partial credit is offered for these questions, double-check your answers!
</Warning>
```

<Warning title="Double-check your answers">
No partial credit is offered for these questions, double-check your answers!
</Warning>

Like with headings and definition list terms, custom alert titles have an `id`
attribute which allows you to link directly to them. They also appear in the
table of contents alongside headings.


### Q&A section

Use

```
<Question prompt="What is a base case? Give an example.">

The <dfn>base case</dfn> is the simplest version of the problem that can be
solved directly without any further recursive calls. For recursive methods that
process strings, the base case is the empty string.
</Question>
```

to create a Q&A section whose answer is hidden by default and can be clicked
to reveal:

<Question prompt="What is a base case? Give an example.">
The <dfn>base case</dfn> is the simplest version of the problem that can be
solved directly without any further recursive calls. For recursive methods that
process strings, the base case is the empty string.
</Question>

Use `MultipleChoice` with two or more `Choice` children and exactly one
`correct` choice for clickable options:

<MultipleChoice prompt={<>Which is correct for obtaining the number of characters in a <code>String</code>?</>}>
  <Choice><code>word.size()</code></Choice>
  <Choice correct><code>word.length()</code></Choice>
  <Choice><code>word.count()</code></Choice>
  <Choice><code>word.length</code></Choice>
</MultipleChoice>


### Generic section

Break up a long page by introducing a `<section>` (a standard HTML 5 element)
which must start with a heading. Generic sections are displayed with a slightly
different background.

Use

```
<Section>

### Submitting your work

Here are the steps to follow when you are ready to submit your work for
this problem set.

...

</Section>
```

to create:

<Section>

### Submitting your work

Here are the steps to follow when you are ready to submit your work for
this problem set.

1. Step one
2. Step two
3. Step three
4. Step four

Email the files you changed to the course staff.

</Section>

### Two-column layout

Use

```
<Columns>
  <Column>Content in the first column (on the left)...</Column>
  <Column>Content in the second column (on the right)...</Column>
</Columns>
```

to arrange Markdown content in two columns:

<Columns>
<Column>
Here is a paragraph in the first column. It can contain any Markdown you want,
including lists:
1. One
2. Two
3. Three
</Column>
<Column>
Here's a paragraph in the second column. We'll use a code block on this side:
```java
// Return true if the number is odd
static boolean isOdd(int n) {
  return n % 2 == 1;
}
```
</Column>
</Columns>

---

## Additional features

These features aren't Markdown-specific, but are included here for reference.

### Time zone chooser

Allows the user to see times in their local time zone.

Insert the built-in time zone chooser component:

```
<TimeZoneChooser />
```

To produce:

<TimeZoneChooser />

Then, wrap your times in `<time datetime="...">` elements and they will be
updated when the user makes a time zone selection.

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

    Here's a second paragraph.

    Here's a third paragraph.

[^footnote-2]: Also known as "LIFO".

[^footnote-3]: Also known as "FIFO".

[front-matter]: https://www.npmjs.com/package/front-matter
[mdx]: https://mdxjs.com/
[commonmark]: https://spec.commonmark.org/
[flavored]: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables
[presto]: https://github.com/abreen/presto
[shiki]: https://shiki.style/
[task-list]: https://github.github.com/gfm/#task-list-items-extension-
