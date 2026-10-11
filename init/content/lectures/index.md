---
title: Lectures
author: alex
description: An example page for <%= site.title %>.
scripts: [lectures/timezone.ts]
---

<p class="time-zone-chooser" hidden>
  <label>
    Show times in
    <select disabled>
      <option value="America/New_York">Eastern Time (ET)</option>
      <option value="America/Chicago">Central Time (CT)</option>
      <option value="America/Denver">Mountain Time (MT)</option>
      <option value="America/Los_Angeles">Pacific Time (PT)</option>
      <option value="Europe/London">London (UK)</option>
      <option value="Asia/Tokyo">Tokyo (JST)</option>
      <option value="UTC">UTC</option>
    </select>
  </label>
</p>
<noscript><p>Times shown in ET.</p></noscript>

One-hour lectures are held weekly at <time datetime="17:40">5:40 PM</time>.
Each lecture is recorded and made available by password-protected link.
Return to this page to access the recordings.

The time zone chooser above is an example of a script for your site: see
`src/lectures/timezone.ts`, which this page lists in its front matter.

<details>
<summary>More details</summary>

Here is a sample collapsible with more information.

</details>

Following lecture, an optional office hour is held, during which you may ask
questions and get hints for the problem sets.


## Lecture notes

Click on each of the links below to access the lecture notes, source code files,
and other relevant information.

[Lecture 1](/lectures/01/index.html)
:   Introduction, computation, models of a computer

[Lecture 2](/lectures/02/index.html)
:   Algorithms
