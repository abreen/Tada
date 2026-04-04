parent: /labs/index.html
parentLabel: Labs
title: Lab 1
author: alex
description: A lab page for <%= site.title %> demonstrating the trace feature.

In this lab, we'll examine memory diagrams.

## A simple trace

A simple program with an array, recursion, and a string.

<%= renderTrace('TraceDemo.java') %>

## Binary search tree

Building a binary search tree with parent references.

!!! note
The `@trace-ignore` hint (used in a comment next to the `parent` field,
see [`SearchTreeDemo.java`](./SearchTreeDemo.java)) allows
[d3-flextree](https://www.npmjs.com/package/d3-flextree) to visually arrange
the nodes as a standard binary tree. Without the hint, the parent references
confuse the algorithm and lead to a more awkward layout.
!!!

<%= renderTrace('SearchTreeDemo.java') %>
