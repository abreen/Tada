---
parent: ../index.html
parentLabel: Labs
title: Lab 2
author: alex
description: A page demonstrating slides mode.
---

<Slides>
<Slide>

## Selection sort

Selection sort is a well-known comparison-based sorting algorithm.

- Divides the array into a sorted left part and an unsorted right part
- Repeatedly scans left-to-right, looking for the smallest element
- Swaps the smallest in the right part into correct position in the left part

</Slide>
<Slide>

<Trace source="selection_sort.py" />

</Slide>
<Slide>

## Impressions

Selection sort's strength is its simplicity.

- The helper method, `index_smallest()` is easy to understand
- `index_smallest()` always scans from `start` to the end
- It requires no additional memory (other than local variables)

</Slide>
<Slide>

## Performance

- The outer loop always performs $n - 1$ iterations
- There are always $n - 1$ swaps
- At each value of `i`, `index_smallest()` iterates from `i + 1` to the end

</Slide>
<Slide>

## Comparisons

The innermost statement compares `nums[i]` and `nums[curr]`.

- when `i` is 0, the comparison is executed $n - 1$ times
- when `i` is 1, the comparison is executed $n - 2$ times
- $\dots$
- when `i` is $n - 3$, the comparison is executed two times
- when `i` is $n - 2$, the comparison is executed one time

Therefore the total number of comparisons $C(n)$ is

$$
(n-1) + (n-2) + \dots + 1 = \sum_{i=1}^{n-1}i = \frac{n(n-1)}{2}
$$

<Question prompt="What complexity class does C(n) belong to?">
It's a quadratic function. The class is $O(n^2)$.
</Question>

</Slide>
<Slide>

## Review

<MultipleChoice prompt="The outer loop of selection sort runs">
  <Choice>$n$ times</Choice>
  <Choice correct>$n - 1$ times</Choice>
  <Choice>$n^2$ times</Choice>
  <Choice>$n - 2$ times</Choice>
</MultipleChoice>

<MultipleChoice prompt="What is selection sort's best case?">
  <Choice>An already sorted array</Choice>
  <Choice>A reverse-sorted array</Choice>
  <Choice>An array filled with the same element</Choice>
  <Choice correct>Its best, worst, and average cases are all the same</Choice>
</MultipleChoice>

</Slide>
</Slides>
