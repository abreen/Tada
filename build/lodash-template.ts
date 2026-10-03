import _ from 'lodash';

/**
 * Compiles a Lodash template that only recognizes `<% %>`, `<%= %>`, and
 * `<%- %>` delimiters.
 *
 * Lodash also treats ES template literal syntax (`${expr}`) as interpolation,
 * but only while `interpolate` is its built-in regex object. Passing a separate
 * regex literal with the same pattern disables that, so `${...}` in Markdown,
 * code samples, and source files stays literal text.
 */
export function compileTemplate(source: string): _.TemplateExecutor {
  return _.template(source, { interpolate: /<%=([\s\S]+?)%>/g });
}
