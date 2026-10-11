import { describe, expect, test } from 'bun:test';
import { parseConfigText } from './config-loader';
import { parseYamlWithVariables, substituteVariables } from './variables';

const vars = {
  courseName: 'CS 0, Intro to CS',
  maxScore: 100,
  isDraft: false,
  nothing: null,
  course: { code: 'CS 112', staff: { email: 'staff@example.edu' } },
  sections: ['A1', 'B1'],
};

describe('substituteVariables', () => {
  test('replaces a variable with its value', () => {
    expect(
      substituteVariables('Welcome to {{ courseName }}.', vars, 'a.md'),
    ).toBe('Welcome to CS 0, Intro to CS.');
  });

  test('allows optional whitespace inside the braces', () => {
    expect(
      substituteVariables(
        '{{courseName}} / {{   courseName   }}',
        vars,
        'a.md',
      ),
    ).toBe('CS 0, Intro to CS / CS 0, Intro to CS');
  });

  test('looks up dotted paths in nested objects', () => {
    expect(
      substituteVariables(
        '{{ course.code }} <{{ course.staff.email }}>',
        vars,
        'a.md',
      ),
    ).toBe('CS 112 <staff@example.edu>');
  });

  test('stringifies numbers and booleans', () => {
    expect(
      substituteVariables('{{ maxScore }} {{ isDraft }}', vars, 'a.md'),
    ).toBe('100 false');
  });

  test('renders null as an empty string', () => {
    expect(substituteVariables('[{{ nothing }}]', vars, 'a.md')).toBe('[]');
  });

  test('inserts values without HTML escaping', () => {
    expect(
      substituteVariables('{{ html }}', { html: '<b>&</b>' }, 'a.md'),
    ).toBe('<b>&</b>');
  });

  test('throws for an unknown variable, naming the file and variable', () => {
    expect(() => substituteVariables('{{ missing }}', vars, 'a.md')).toThrow(
      /a\.md: unknown variable "\{\{ missing \}\}"/,
    );
  });

  test('throws for an unknown nested property', () => {
    expect(() =>
      substituteVariables('{{ course.missing }}', vars, 'a.md'),
    ).toThrow(/unknown variable "\{\{ course\.missing \}\}"/);
  });

  test('throws when a path goes through a non-object value', () => {
    expect(() =>
      substituteVariables('{{ courseName.length }}', vars, 'a.md'),
    ).toThrow(/unknown variable/);
  });

  test('does not resolve inherited properties', () => {
    expect(() =>
      substituteVariables('{{ constructor }}', vars, 'a.md'),
    ).toThrow(/unknown variable/);
    expect(() =>
      substituteVariables('{{ course.toString }}', vars, 'a.md'),
    ).toThrow(/unknown variable/);
  });

  test('throws for object and array values', () => {
    expect(() => substituteVariables('{{ course }}', vars, 'a.md')).toThrow(
      /a\.md: variable "\{\{ course \}\}" is an object/,
    );
    expect(() => substituteVariables('{{ sections }}', vars, 'a.md')).toThrow(
      /a\.md: variable "\{\{ sections \}\}" is an array/,
    );
  });

  test('a backslash escapes a variable as literal text', () => {
    expect(
      substituteVariables('Write \\{{ courseName }} to use it.', vars, 'a.md'),
    ).toBe('Write {{ courseName }} to use it.');
    expect(substituteVariables('\\{{ missing }}', vars, 'a.md')).toBe(
      '{{ missing }}',
    );
  });

  test('two backslashes before a variable are one literal backslash', () => {
    expect(substituteVariables('C:\\\\{{ maxScore }}', vars, 'a.md')).toBe(
      'C:\\100',
    );
    expect(substituteVariables('\\\\\\{{ maxScore }}', vars, 'a.md')).toBe(
      '\\{{ maxScore }}',
    );
  });

  test('substitutes in code like anywhere else', () => {
    expect(
      substituteVariables(
        '`{{ maxScore }}`\n```\nprint(f"\\{{x}}")\n```\n',
        vars,
        'a.md',
      ),
    ).toBe('`100`\n```\nprint(f"{{x}}")\n```\n');
  });

  test('substitutes a variable followed by a closing brace', () => {
    expect(substituteVariables('{a:{{ maxScore }}}', vars, 'a.md')).toBe(
      '{a:100}',
    );
  });

  test('leaves partial directives untouched', () => {
    const source = '{{{ _partial.md }}}\n\n\\{{{ _escaped.md }}}';
    expect(substituteVariables(source, vars, 'a.md')).toBe(source);
  });

  test('substitutes a variable after a dollar sign', () => {
    expect(substituteVariables('costs ${{ maxScore }}', vars, 'a.md')).toBe(
      'costs $100',
    );
  });

  test('leaves non-identifier expressions untouched', () => {
    const source = '{{ count + 1 }} {{#if x}} {{ fn() }} {{ }} {{ 1abc }}';
    expect(substituteVariables(source, vars, 'a.md')).toBe(source);
  });

  test('leaves ES template literal and Lodash syntax untouched', () => {
    const source =
      'echo "${HOME}" `${x}` <%= vars.courseName %> <% if (x) { %>';
    expect(substituteVariables(source, vars, 'a.md')).toBe(source);
  });

  test('replaces every occurrence across lines', () => {
    expect(
      substituteVariables(
        'line1 {{ maxScore }}\nline2\n{{ maxScore }} line3\n',
        vars,
        'a.md',
      ),
    ).toBe('line1 100\nline2\n100 line3\n');
  });

  test('scans a long run of backslashes in linear time', () => {
    const text = '\\'.repeat(50_000) + 'x';
    const start = performance.now();
    expect(substituteVariables(text, vars, 'a.md')).toBe(text);
    expect(performance.now() - start).toBeLessThan(100);
  });

  test('returns text without variables unchanged', () => {
    expect(substituteVariables('class Foo {}\n', {}, 'Foo.java')).toBe(
      'class Foo {}\n',
    );
  });
});

describe('parseYamlWithVariables', () => {
  const parse = (text: string) => parseConfigText(text, 'a.yaml');

  test('fails for a value parsed from an unquoted variable', () => {
    expect(() =>
      parseYamlWithVariables('title: {{ courseName }}', 'content/a.md', parse),
    ).toThrow(
      'content/a.md: a value for "title" starts with an unquoted {{ }} variable; quote it',
    );
  });

  test('names the nested field that holds the unquoted variable', () => {
    expect(() =>
      parseYamlWithVariables(
        '- title: Home\n  links:\n    - text: {{ courseName }}\n',
        'nav.yaml',
        parse,
      ),
    ).toThrow('nav.yaml: a value for "text" starts with an unquoted');
  });

  test('explains invalid YAML from an unquoted variable followed by text', () => {
    expect(() =>
      parseYamlWithVariables(
        'title: Home\ndescription: {{ courseName }} notes\n',
        'content/a.md',
        parse,
      ),
    ).toThrow(
      'content/a.md: a value for "description" starts with an unquoted',
    );
  });

  test('reports other YAML errors unchanged', () => {
    expect(() =>
      parseYamlWithVariables('a: [1, 2\nb: "{{ x }} y"\n', 'a.yaml', parse),
    ).toThrow('YAML Parse error');
  });

  test('does not blame a variable in a block scalar for another YAML error', () => {
    expect(() =>
      parseYamlWithVariables(
        'notes: |\n  Due: {{ dueDate }}\nlist: [1, 2\n',
        'a.yaml',
        parse,
      ),
    ).toThrow('a.yaml: YAML Parse error');
  });

  test('accepts quoted variables and ordinary values', () => {
    expect(
      parseYamlWithVariables(
        'title: "{{ x }} home"\nbreadcrumbs:\n  - label: a\n    url: /\n',
        'a.md',
        parse,
      ),
    ).toEqual({
      title: '{{ x }} home',
      breadcrumbs: [{ label: 'a', url: '/' }],
    });
  });
});
