// A <details> element in page content without its own summary becomes a
// preview: the build gives it a Show more/Show less summary, and the styles show the
// start of its body while it is closed, with the summary as a button below it
const DETAILS_PREVIEW_CLASS = 'details-preview';

const SUMMARY_HTML =
  '<summary data-pagefind-ignore=""><span class="open-label">Show more</span><span class="close-label">Show less</span></summary>';

// Indexes (in document order) of the details elements that have a summary
// child
function findDetailsWithSummary(html: string): Set<number> {
  const withSummary = new Set<number>();
  const open: number[] = [];
  let count = 0;

  new HTMLRewriter()
    .on('details', {
      element(element) {
        open.push(count++);
        element.onEndTag(() => {
          open.pop();
        });
      },
    })
    .on('details > summary', {
      element() {
        const index = open.at(-1);
        if (index !== undefined) {
          withSummary.add(index);
        }
      },
    })
    .transform(html);

  return withSummary;
}

// Runs on rendered page content, before it is placed in a page template
export function addDetailsPreviewSummaries(html: string): string {
  if (!/<details[\s>]/i.test(html)) {
    return html;
  }

  const withSummary = findDetailsWithSummary(html);
  let count = 0;

  return new HTMLRewriter()
    .on('details', {
      element(element) {
        if (withSummary.has(count++)) {
          return;
        }
        const className = element.getAttribute('class')?.trim();
        element.setAttribute(
          'class',
          className
            ? `${className} ${DETAILS_PREVIEW_CLASS}`
            : DETAILS_PREVIEW_CLASS,
        );
        element.prepend(SUMMARY_HTML, { html: true });
      },
    })
    .transform(html);
}
