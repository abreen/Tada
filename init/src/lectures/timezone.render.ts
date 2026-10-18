// An example of a renderer for a Tada site.
//
// Tada runs this file at build time because it sits next to timezone.ts,
// which the Lectures page lists in its front matter. For each
// <tz-chooser></tz-chooser> element on the page, Tada calls the render
// function below and places the HTML it returns inside the element. The
// chooser is then part of the page before any JavaScript runs, so it takes up
// its space right away and shows the time zone even with JavaScript turned
// off. timezone.ts enables it in the browser.
import type { Renderers } from '@abreen/tada';
import { DEFAULT_TIME_ZONE, TIME_ZONES } from './time-zones';

const renderers: Renderers = {
  'tz-chooser': () => {
    const options = TIME_ZONES.map(
      ({ value, label }) =>
        `<option value="${value}"${value === DEFAULT_TIME_ZONE ? ' selected' : ''}>${label}</option>`,
    ).join('');
    // Disabled until timezone.ts runs, since changing it does nothing
    // without JavaScript
    return `<p><label>Show times in <select disabled>${options}</select></label></p>`;
  },
};
export default renderers;
