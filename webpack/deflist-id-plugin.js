const textToId = require('./text-to-id');

module.exports = function deflistIdPlugin(md) {
  md.core.ruler.push('deflist_id_injector', function (state) {
    const tokens = state.tokens;
    const used = new Map();

    function slugify(str) {
      let slug = textToId(str);

      if (!slug) {
        slug = 'term';
      }

      if (used.has(slug)) {
        const n = used.get(slug) + 1;
        used.set(slug, n);
        slug = `${slug}-${n}`;
      } else {
        used.set(slug, 1);
      }

      return slug;
    }

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'dt_open') continue;

      let termText = '';
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j];

        if (t.type === 'dt_close') {
          break;
        }

        if (t.type === 'text') {
          termText += t.content;
        } else if (t.type === 'inline' && t.children) {
          for (const child of t.children) {
            if (child.type === 'text') {
              termText += child.content;
            }
          }
        }
      }

      if (!termText) {
        continue;
      }

      const slug = slugify(termText);
      const token = new state.Token('html_inline', '', 0);
      token.content = `<a id="${slug}"></a>`;
      tokens.splice(i + 1, 0, token);
      // Skip token we just inserted
      i++;
    }
  });
};
