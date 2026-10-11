import hashlib
import os
import re

import pytest
from conftest import SITE_PROD_CONFIG_FILE, init_site, run_tada, set_site_config
from watch_helpers import WatchProcess

SCRIPT_MARKER = re.compile(r'<link rel="modulepreload" href="([^"]+)" data-tada-script>')
STYLE_LINK = re.compile(r'<link href="([^"]+)" rel="stylesheet" data-tada-style>')


def write(site, relative, text):
    path = site.joinpath(*relative.split('/'))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return path


def page(title, scripts=None, body='Body'):
    front_matter = f'title: {title}\n'
    if scripts is not None:
        front_matter += f'scripts: [{", ".join(scripts)}]\n'
    return f'---\n{front_matter}---\n\n{body}\n'


def script_hrefs(html):
    return SCRIPT_MARKER.findall(html)


def style_hrefs(html):
    return STYLE_LINK.findall(html)


def output_file(dist, href, base_path=''):
    """The output file for an absolute href, with the base path removed."""
    assert href.startswith(base_path + '/')
    return dist.joinpath(*href[len(base_path) + 1 :].split('/'))


@pytest.fixture
def site(tmp_path):
    site = init_site(tmp_path)
    write(site, 'content/index.md', page('Home', ['lectures/clock.ts']))
    write(
        site,
        'src/lectures/clock.ts',
        "import './clock.scss';\n"
        "import type { Mount } from '@abreen/tada';\n"
        'const label: string = "clock mounted";\n'
        'const mount: Mount = ({ window }) => {\n'
        '  window.document.body.dataset.clock = label;\n'
        '};\n'
        'export default mount;\n',
    )
    write(site, 'src/lectures/clock.scss', '$accent: rebeccapurple;\n.clock { color: $accent; }\n')
    return site


def test_dev_build_compiles_listed_scripts_and_styles(site):
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')

    assert script_hrefs(html) == ['/_scripts/lectures/clock.js']
    script = output_file(dist, '/_scripts/lectures/clock.js').read_text(encoding='utf-8')
    assert 'clock mounted' in script
    assert 'const label: string' not in script

    [style] = style_hrefs(html)
    css = output_file(dist, style).read_text(encoding='utf-8')
    assert '.clock' in css
    assert '$accent' not in css
    head = html[: html.index('</head>')]
    assert head.index('index.bundle') < head.index(style)

    # src/ is compiled, never published as-is
    assert not (dist / 'src').exists()
    assert not list(dist.rglob('*.ts'))
    assert not list(dist.rglob('*.scss'))


def test_page_without_scripts_has_no_markers(site):
    write(site, 'content/about.md', page('About'))
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'about.html').read_text(encoding='utf-8')
    assert script_hrefs(html) == []
    assert style_hrefs(html) == []


def test_prod_build_minifies_and_hashes_scripts_under_base_path(site):
    set_site_config(site, {'basePath': '/course'}, config_file=SITE_PROD_CONFIG_FILE)
    result = run_tada('prod', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist-prod' / 'v1'
    html = (dist / 'index.html').read_text(encoding='utf-8')

    [href] = script_hrefs(html)
    assert re.fullmatch(r'/course/_scripts/lectures/clock-[a-z0-9]+\.js', href)
    script = output_file(dist, href, '/course').read_text(encoding='utf-8')
    assert '\n  ' not in script
    assert 'clock mounted' in script

    [style] = style_hrefs(html)
    assert re.fullmatch(r'/course/_scripts/lectures/clock-[a-z0-9]+\.css', style)
    assert output_file(dist, style, '/course').is_file()


def test_shared_imports_become_one_chunk(site):
    write(site, 'src/shared.ts', 'export const greeting = () => "shared helper";\n')
    for name in ['a', 'b']:
        write(
            site,
            f'src/{name}.ts',
            "import { greeting } from './shared';\n"
            f'export default () => console.log(greeting(), "{name}");\n',
        )
        write(site, f'content/{name}.md', page(name.upper(), [f'{name}.ts']))
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    scripts = site / 'dist' / '_scripts'
    chunks = [path for path in (scripts / 'chunks').iterdir()]
    assert len(chunks) == 1
    assert 'shared helper' in chunks[0].read_text(encoding='utf-8')
    for name in ['a', 'b']:
        assert 'shared helper' not in (scripts / f'{name}.js').read_text(encoding='utf-8')


def test_missing_script_fails_and_names_the_page(site):
    write(site, 'content/broken.md', page('Broken', ['lectures/clok.ts']))
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert 'content/broken.md: script "lectures/clok.ts" not found in src/' in result.stdout


def test_malformed_scripts_value_fails(site):
    write(site, 'content/broken.md', page('Broken', ['../outside.ts']))
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert (
        'scripts[0] "../outside.ts" must be a src-relative POSIX path ending in .ts or .js'
        in result.stdout
    )


def test_compile_error_fails_the_build(site):
    write(site, 'src/lectures/clock.ts', 'export default () => {')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert 'src/lectures/clock.ts:1:' in result.stdout
    assert 'Unexpected end of file' in result.stdout


def test_typescript_code_pages_coexist_with_site_scripts(site):
    set_site_config(site, {'extensionToShikiLanguage': {'ts': 'typescript'}})
    write(site, 'content/examples/Demo.ts', 'export const demo: number = 1;\n')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'

    # Course material in content/ is still a code page and a download
    assert (dist / 'examples' / 'Demo.ts.html').is_file()
    assert (dist / 'examples' / 'Demo.ts').read_text(encoding='utf-8') == (
        'export const demo: number = 1;\n'
    )
    # The site's own TypeScript in src/ is compiled
    assert (dist / '_scripts' / 'lectures' / 'clock.js').is_file()
    assert not (dist / 'lectures' / 'clock.ts.html').exists()


def test_site_wide_scripts_load_on_every_page(site):
    set_site_config(
        site,
        {'scripts': ['site.ts'], 'extensionToShikiLanguage': {'py': 'python'}},
    )
    write(site, 'src/site.ts', 'export default () => console.log("site wide");\n')
    write(site, 'content/about.md', page('About'))
    write(site, 'content/demo.py', 'print("hi")\n')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'

    assert script_hrefs((dist / 'index.html').read_text(encoding='utf-8')) == [
        '/_scripts/site.js',
        '/_scripts/lectures/clock.js',
    ]
    for output in ['about.html', 'demo.py.html']:
        html = (dist / output).read_text(encoding='utf-8')
        assert script_hrefs(html) == ['/_scripts/site.js']


def test_missing_site_wide_script_fails(site):
    set_site_config(site, {'scripts': ['gone.ts']})
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert 'scripts[0] "gone.ts" not found in src/' in result.stdout


def test_content_conflicting_with_script_output_fails(site):
    write(site, 'content/_scripts/lectures/clock.js', 'console.log("content");\n')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert '_scripts/lectures/clock.js' in result.stdout


def test_watch_recompiles_when_an_import_changes(site):
    write(site, 'src/lectures/words.ts', 'export const word = "before edit";\n')
    write(
        site,
        'src/lectures/clock.ts',
        "import { word } from './words';\nexport default () => console.log(word);\n",
    )
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / '_scripts' / 'lectures' / 'clock.js'
        assert 'before edit' in output.read_text(encoding='utf-8')
        mtime = output.stat().st_mtime
        write(site, 'src/lectures/words.ts', 'export const word = "after edit";\n')
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert 'after edit' in output.read_text(encoding='utf-8')
    finally:
        wp.stop()


def test_watch_adds_scripts_listed_in_front_matter(site):
    write(site, 'content/about.md', page('About'))
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'about.html'
        assert script_hrefs(output.read_text(encoding='utf-8')) == []
        mtime = output.stat().st_mtime
        write(site, 'src/about.ts', 'export default () => console.log("about");\n')
        write(site, 'content/about.md', page('About', ['about.ts']))
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert script_hrefs(output.read_text(encoding='utf-8')) == ['/_scripts/about.js']
        assert (site / 'dist' / '_scripts' / 'about.js').is_file()
    finally:
        wp.stop()


def test_watch_rerenders_pages_when_a_script_gains_a_stylesheet(site):
    write(site, 'src/lectures/clock.ts', 'export default () => {};\n')
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'index.html'
        assert style_hrefs(output.read_text(encoding='utf-8')) == []
        mtime = output.stat().st_mtime
        write(site, 'src/lectures/clock.ts', "import './clock.scss';\nexport default () => {};\n")
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        [style] = style_hrefs(output.read_text(encoding='utf-8'))
        assert output_file(site / 'dist', style).is_file()
    finally:
        wp.stop()


def test_watch_notices_src_created_after_start(tmp_path):
    site = init_site(tmp_path)
    assert not (site / 'src').exists()
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / '_scripts' / 'late.js'
        write(site, 'src/late.ts', 'export default () => console.log("first");\n')
        write(site, 'content/index.md', page('Home', ['late.ts']))
        wp.wait_for_rebuild(output, 'exists')
        assert 'first' in output.read_text(encoding='utf-8')
        mtime = output.stat().st_mtime
        write(site, 'src/late.ts', 'export default () => console.log("second");\n')
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert 'second' in output.read_text(encoding='utf-8')
    finally:
        wp.stop()


# Bytes that are not valid UTF-8, so decoding them as text would change them
PNG_BYTES = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF, 0xFE, 0x80])


@pytest.mark.parametrize(
    'specifier', ['./images/logo.png', '../images/logo.png', 'some-package/logo.svg']
)
def test_importing_a_file_from_a_script_fails(site, specifier):
    site.joinpath('src', 'images').mkdir(parents=True)
    site.joinpath('src', 'images', 'logo.png').write_bytes(PNG_BYTES)
    write(site, 'node_modules/some-package/package.json', '{"name": "some-package"}\n')
    write(site, 'node_modules/some-package/logo.svg', '<svg></svg>\n')
    importer = 'src/top.ts' if specifier.startswith('./') else 'src/lectures/clock.ts'
    write(site, importer, f"import logo from '{specifier}';\nexport default () => logo;\n")
    if importer == 'src/top.ts':
        write(site, 'content/top.md', page('Top', ['top.ts']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert f'{importer}: cannot import "{specifier}"' in result.stdout
    assert 'put files in content/ or public/' in result.stdout


def test_modules_with_dots_in_their_names_can_be_imported(site):
    write(site, 'src/lectures/site.config.ts', 'export const greeting = "from config";\n')
    write(
        site,
        'node_modules/dotted.package/package.json',
        '{"name": "dotted.package", "main": "index.js"}\n',
    )
    write(site, 'node_modules/dotted.package/index.js', 'export const dotted = "from package";\n')
    write(
        site,
        'src/lectures/clock.ts',
        "import { greeting } from './site.config';\n"
        "import { dotted } from 'dotted.package';\n"
        'export default () => console.log(greeting, dotted);\n',
    )
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    script = (site / 'dist' / '_scripts' / 'lectures' / 'clock.js').read_text(encoding='utf-8')
    assert 'from config' in script
    assert 'from package' in script


@pytest.mark.parametrize(
    'stylesheet, rule',
    [
        ('src/lectures/clock.css', "@import '../../outside.css';"),
        ('src/lectures/clock.scss', "@use '../../outside';"),
    ],
)
def test_stylesheet_imports_outside_src_fail(site, stylesheet, rule):
    write(site, 'outside.css', '.outside { color: red; }\n')
    write(site, 'outside.scss', '.outside { color: red; }\n')
    write(site, stylesheet, f'{rule}\n.clock {{ color: blue; }}\n')
    if stylesheet.endswith('.css'):
        write(site, 'src/lectures/clock.ts', "import './clock.css';\nexport default () => {};\n")

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert f'{stylesheet}:' in result.stdout
    assert 'is outside src/' in result.stdout


def test_stylesheet_url_outside_src_fails(site):
    site.joinpath('public').mkdir(exist_ok=True)
    site.joinpath('public', 'paper.png').write_bytes(PNG_BYTES)
    write(site, 'src/lectures/clock.scss', '.clock { background: url(../../public/paper.png); }\n')

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 1
    assert 'src/lectures/clock.scss: "../../public/paper.png" is outside src/' in result.stdout


def test_absolute_stylesheet_urls_get_the_base_path(site):
    set_site_config(site, {'basePath': '/course'}, config_file=SITE_PROD_CONFIG_FILE)
    write(
        site,
        'src/lectures/clock.scss',
        '.a { background: url(/images/paper.png); }\n'
        ".b { background: url('/images/quoted.png'); }\n"
        '.c { background: url(https://example.com/remote.png); }\n',
    )
    result = run_tada('prod', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist-prod' / 'v1'
    [style] = style_hrefs((dist / 'index.html').read_text(encoding='utf-8'))
    css = output_file(dist, style, '/course').read_text(encoding='utf-8')
    assert re.search(r'url\(["\']?/course/images/paper\.png', css)
    assert re.search(r'url\(["\']?/course/images/quoted\.png', css)
    assert 'https://example.com/remote.png' in css


def test_inline_type_import_is_removed(site):
    write(
        site,
        'src/lectures/clock.ts',
        "import { type Mount } from '@abreen/tada';\n"
        'const mount: Mount = () => {};\n'
        'export default mount;\n',
    )
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    script = (site / 'dist' / '_scripts' / 'lectures' / 'clock.js').read_text(encoding='utf-8')
    assert '@abreen/tada' not in script


def test_files_referenced_from_imported_css_are_published_unchanged(site):
    # Large enough that Bun writes a file instead of inlining a data URL
    paper = PNG_BYTES * 25000
    site.joinpath('src', 'lectures', 'paper.png').write_bytes(paper)
    write(site, 'src/lectures/clock.scss', '.clock { background: url(./paper.png); }\n')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    [style] = style_hrefs(html)
    css_file = output_file(dist, style)
    [url] = re.findall(r'url\("?([^")]+)"?\)', css_file.read_text(encoding='utf-8'))
    # Relative to the stylesheet, which is how browsers resolve CSS URLs.
    # Compare digests: a failing comparison of large bytes is slow to report.
    published = (css_file.parent / url).read_bytes()
    assert hashlib.sha256(published).hexdigest() == hashlib.sha256(paper).hexdigest()


def test_symlinked_src_directory(tmp_path):
    site = init_site(tmp_path)
    shared = tmp_path / 'shared-src'
    write(shared, 'lectures/clock.ts', 'export default () => console.log("linked");\n')
    try:
        os.symlink(shared, site / 'src', target_is_directory=True)
    except OSError:
        pytest.skip('symbolic links are not available')
    write(site, 'content/index.md', page('Home', ['lectures/clock.ts']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
    assert script_hrefs(html) == ['/_scripts/lectures/clock.js']


def test_watch_keeps_reporting_a_broken_script_until_it_is_fixed(site):
    write(site, 'content/about.md', page('About'))
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        write(site, 'src/lectures/clock.ts', 'export default () => {')
        wp.wait_for_error()
        # An unrelated edit must not hide the error behind the old script
        write(site, 'content/about.md', page('About', body='Edited'))
        wp.wait_for_error()
        write(site, 'src/lectures/clock.ts', 'export default () => console.log("fixed");\n')
        wp.wait_for_successful_rebuild()
        output = site / 'dist' / '_scripts' / 'lectures' / 'clock.js'
        assert 'fixed' in output.read_text(encoding='utf-8')
    finally:
        wp.stop()
