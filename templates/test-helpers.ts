import { compileTemplate } from '../build/lodash-template';
import TOP_TEMPLATE from './_top.html' with { type: 'text' };
import HEADER_BRAND_TEMPLATE from './_header-brand.html' with { type: 'text' };

// Render the page top with its header brand partial, deriving the header mode
// from the nav and search like the build does
export function renderTopTemplate(
  params: Record<string, unknown> & {
    site: { features: { search?: boolean } };
  },
) {
  const hasNav = (params.hasNav as boolean | undefined) ?? true;
  const full: Record<string, unknown> = {
    ...params,
    hasNav,
    isHeaderFloating: hasNav || Boolean(params.site.features.search),
  };
  full.render = (name: string) =>
    name === '_header-brand.html'
      ? compileTemplate(HEADER_BRAND_TEMPLATE)(full)
      : '';
  return compileTemplate(TOP_TEMPLATE)(full);
}

// Render a template whose render() calls resolve to the given partials, sharing
// the page's params like the build does; other partials render nothing
export function renderWithPartials(
  source: string,
  params: Record<string, unknown>,
  partials: Record<string, string>,
): string {
  const full: Record<string, unknown> = { ...params };
  full.render = (name: string) =>
    name in partials ? compileTemplate(partials[name])(full) : '';
  return compileTemplate(source)(full);
}
