import _ from 'lodash';

/**
 * Compiles one of Tada's internal Lodash templates (`templates/`), which only
 * recognize `<% %>`, `<%= %>`, and `<%- %>` delimiters. Author content uses
 * `{{ name }}` site variables instead (see `variables.ts`).
 *
 * Lodash also treats ES template literal syntax (`${expr}`) as interpolation,
 * but only while `interpolate` is its built-in regex object. Passing a separate
 * regex literal with the same pattern disables that, so `${...}` in templates
 * stays literal text.
 */
export function compileTemplate(source: string): _.TemplateExecutor {
  return _.template(source, { interpolate: /<%=([\s\S]+?)%>/g });
}
