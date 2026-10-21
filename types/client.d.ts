// Types for scripts a Tada site compiles from its src/ directory, published
// as `@abreen/tada`. Import them with `import type`, which is removed at build
// time, so a site builds without installing the package.

/** What Tada passes to a script's default export each time its page is shown */
export interface MountOptions {
  window: Window;
  /** Aborted when the visitor leaves the page, before the cleanup function runs */
  signal: AbortSignal;
}

/** Undoes a mount when the visitor leaves the page */
export type Unmount = () => void;

/**
 * The default export of a script listed in `scripts`. It runs each time the
 * page is shown: on a full page load and after each client-side navigation to
 * the page. Code at the top level of the module runs once per visit; on a
 * client-side navigation it runs before the page's content is swapped in.
 */
export type Mount = (
  options: MountOptions,
) => void | Unmount | Promise<void | Unmount>;

/** What Tada passes to a render function for each element it fills */
export interface RenderInfo {
  /** The element's attributes as written, with lowercase names */
  attributes: Readonly<Record<string, string>>;
  /** The element's content as written, after Markdown */
  html: string;
  page: {
    /** The page's URL path without the base path, such as `/lectures/index.html` */
    path: string;
    /** The page's front matter, after site variables are substituted */
    frontMatter: Readonly<Record<string, unknown>>;
  };
  /** The site variables from the site config's `vars` */
  vars: Readonly<Record<string, unknown>>;
}

/**
 * Returns the HTML that Tada places inside an element at build time, such as
 * a control that a script enables in the browser
 */
export type Render = (info: RenderInfo) => string;

/**
 * The default export of a renderer module, such as `timezone.render.ts` next
 * to `timezone.ts`: render functions keyed by custom element name
 */
export type Renderers = Readonly<Record<string, Render>>;

/** The detail of the `tada:navigation` event dispatched on `window` */
export interface NavigationEventDetail {
  /** The pathname and query of the page now shown, including the base path */
  path: string;
  validators: { etag: string | null; lastModified: string | null };
}

declare global {
  interface WindowEventMap {
    'tada:navigation': CustomEvent<NavigationEventDetail>;
  }
}
