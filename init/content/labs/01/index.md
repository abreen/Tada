parent: /labs/index.html
parentLabel: Labs
title: Lab 1
author: alex
description: A lab page for <%= site.title %> demonstrating the trace feature.

In this lab, we'll examine memory diagrams.

## A simple trace

A simple program with an array, recursion, and a string.

<%= renderTrace('TraceDemo.java') %>

## Linked list

Building a linked list from a string array.

<%= renderTrace('ListDemo.java') %>

## Binary tree

Building a binary tree.

<%= renderTrace('BinaryTreeDemo.java') %>

## Binary search tree

Building a binary search tree with parent pointers.

<%= renderTrace('SearchTreeDemo.java') %>
