# Strict Front Matter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require delimited YAML front matter on every processed Tada 2 page and remove the Presto-compatible parser path.

**Architecture:** Centralize processed-page parsing in one helper backed by the existing `front-matter` package. Validate and normalize the opening delimiter before parsing, distinguish missing-opening from missing-closing errors, and leave partials and unprocessed file types unchanged.

**Tech Stack:** TypeScript, Bun, `front-matter@4`, Bun test, pytest

---

### Task 1: Define the Strict Parser Contract

**Files:**
- Modify: `build/utils/front-matter.test.ts`
- Modify: `build/utils/front-matter.ts`

- [ ] **Step 1: Replace delimiterless success cases with failing contract tests**

Add table-driven assertions that `.md`, `.markdown`, `.mdx`, and `.html`
inputs beginning with `title:` throw an error containing
`front matter must start with ---`. Keep the unknown-extension test asserting
that `.txt` content is returned unchanged.

- [ ] **Step 2: Run the focused test and verify red**

Run: `bun run test:unit build/utils/front-matter.test.ts`

Expected: FAIL because processed pages still accept delimiterless YAML.

- [ ] **Step 3: Replace both extraction branches with one strict parse**

Implement one internal processed-page parser that:

```ts
const firstNewline = rawContent.indexOf('\n');
const firstLine =
  firstNewline === -1 ? rawContent : rawContent.slice(0, firstNewline);
if (firstLine.trimEnd() !== '---') {
  throw new Error('Front matter must start with ---');
}
const normalized = `---${rawContent.slice(firstLine.length)}`;
if (!fm.test(normalized)) {
  throw new Error(
    'Front matter starts with --- but no closing --- delimiter was found',
  );
}
const parsed = fm(normalized);
```

Return `parsed.frontmatter`, `parsed.body`, and `parsed.attributes` from this
single parse. Remove `parseFrontMatterPlainText` and the redundant YAML reparse
in `parseFrontMatterAndContent`.

- [ ] **Step 4: Run the focused test and verify green**

Run: `bun run test:unit build/utils/front-matter.test.ts`

Expected: PASS for strict errors, CRLF, empty blocks, blank YAML lines, and
trailing delimiter whitespace.

### Task 2: Migrate Repository Fixtures and Documentation

**Files:**
- Modify: delimiterless fixtures under `build/**/*.test.ts`,
  `functional_tests/**/*.py`, and `playwright/**/*.ts`
- Modify: `spec/front-matter.md`
- Modify: `spec/migration-2.md`

- [ ] **Step 1: Run affected suites to locate delimiterless fixtures**

Run: `bun run test:unit`

Expected: FAIL only where a processed page fixture still begins directly with
YAML fields.

- [ ] **Step 2: Add delimiters to each page fixture**

Convert each page fixture from:

```text
title: Example

Body
```

to:

```text
---
title: Example
---

Body
```

Do not add front matter to MDX partial fixtures.

- [ ] **Step 3: Update feature specifications**

Make `spec/front-matter.md` document one required format and remove the legacy
section. Add a migration row to `spec/migration-2.md` mapping delimiterless YAML
to a `---`-delimited block.

- [ ] **Step 4: Verify migrated unit fixtures**

Run: `bun run test:unit`

Expected: all unit tests pass.

### Task 3: Complete Verification and Scope Audit

**Files:**
- Modify only if a migrated fixture requires it: `functional_tests/**/*.py`,
  `playwright/**/*.ts`

- [ ] **Step 1: Run static checks**

Run: `bun run typecheck`

Run: `bun run lint`

Run: `bun run lint:sass`

Run: `bun run check-deps`

Expected: all commands pass.

- [ ] **Step 2: Run browser and functional verification**

Run: `bun run test:playwright`

Run: `bun run test:functional`

Expected: all Playwright and functional tests pass.

- [ ] **Step 3: Audit scope and whitespace**

Run: `git diff --check`

Confirm that the five deferred MDX review findings remain unchanged and that
partials still render without page front matter.
