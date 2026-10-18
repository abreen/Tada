import json

import pytest
from conftest import SITE_PROD_CONFIG_FILE, init_site, run_tada, set_site_config
from test_packages import write_package
from watch_helpers import WatchProcess


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


CHOOSER = '<tz-chooser data-zone="ET">\n</tz-chooser>'


@pytest.fixture
def site(tmp_path):
    site = init_site(tmp_path)
    write(site, 'content/index.md', page('Home', ['clock.ts'], CHOOSER))
    write(site, 'src/clock.ts', 'export default () => {};\n')
    write(
        site,
        'src/clock.render.ts',
        "import type { Renderers } from '@abreen/tada';\n"
        'const renderers: Renderers = {\n'
        "  'tz-chooser': ({ attributes }) =>\n"
        '    `<select disabled><option>${attributes["data-zone"]} (rendered)</option></select>`,\n'
        '};\n'
        'export default renderers;\n',
    )
    return site


def build(site, mode='dev'):
    return run_tada(mode, cwd=str(site))


def test_renders_elements_at_build_time(site):
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    assert (
        '<tz-chooser data-zone="ET">'
        '<select disabled><option>ET (rendered)</option></select>'
        '</tz-chooser>'
    ) in html
    # Renderers run at build time only; nothing of theirs is published
    for file in (dist / '_scripts').rglob('*.js'):
        assert '(rendered)' not in file.read_text(encoding='utf-8')
    assert not list(dist.rglob('*.render.*'))


def test_render_info_has_page_front_matter_and_vars(site):
    set_site_config(site, {'vars': {'course': 'CS 101'}})
    write(
        site,
        'content/lectures/index.md',
        page('Lectures', ['info.ts'], '<page-info>\n<em>Inner</em>\n</page-info>'),
    )
    write(site, 'src/info.ts', 'export default () => {};\n')
    write(
        site,
        'src/info.render.ts',
        'export default {\n'
        "  'page-info': info => `<pre>${JSON.stringify(info)"
        '.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`,\n'
        '};\n',
    )
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'lectures' / 'index.html').read_text(encoding='utf-8')
    raw = html[
        html.index('<page-info><pre>') + len('<page-info><pre>') : html.index('</pre></page-info>')
    ]
    info = json.loads(raw.replace('&lt;', '<').replace('&amp;', '&'))
    assert info['attributes'] == {}
    assert info['html'] == '\n<em>Inner</em>\n'
    assert info['page']['path'] == '/lectures/index.html'
    assert info['page']['frontMatter']['title'] == 'Lectures'
    assert info['vars']['course'] == 'CS 101'


def test_rendered_links_get_the_base_path_and_are_checked(site):
    write(
        site,
        'src/clock.render.ts',
        "export default { 'tz-chooser': () => '<a href=\"/index.html\">Home</a>' };\n",
    )
    set_site_config(site, {'basePath': '/course'}, config_file=SITE_PROD_CONFIG_FILE)
    result = build(site, 'prod')
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist-prod' / 'v1' / 'index.html').read_text(encoding='utf-8')
    assert '<a href="/course/index.html"' in html

    write(
        site,
        'src/clock.render.ts',
        "export default { 'tz-chooser': () => '<a href=\"/missing.html\">Gone</a>' };\n",
    )
    result = build(site)
    assert result.returncode == 1
    assert '/missing.html' in result.stdout


def test_renderers_apply_to_html_pages_and_site_wide_scripts(site):
    set_site_config(site, {'scripts': ['clock.ts']})
    write(site, 'content/index.md', page('Home', None, CHOOSER))
    write(
        site,
        'content/about.html',
        '---\ntitle: About\n---\n<tz-chooser data-zone="PT"></tz-chooser>\n',
    )
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / 'dist'
    assert 'ET (rendered)' in (dist / 'index.html').read_text(encoding='utf-8')
    assert 'PT (rendered)' in (dist / 'about.html').read_text(encoding='utf-8')


def test_pages_without_the_script_leave_the_element_alone(site):
    write(site, 'content/other.md', page('Other', None, CHOOSER))
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'other.html').read_text(encoding='utf-8')
    assert CHOOSER in html


def test_renderers_can_import_shared_modules_with_styles_and_await(site):
    write(site, 'src/shared.ts', "import './shared.scss';\nexport const label = 'shared label';\n")
    write(site, 'src/shared.scss', '.shared { color: red; }\n')
    write(
        site,
        'src/clock.render.ts',
        "import { label } from './shared';\n"
        'const suffix = await Promise.resolve(" awaited");\n'
        "export default { 'tz-chooser': () => label + suffix };\n",
    )
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
    assert '<tz-chooser data-zone="ET">shared label awaited</tz-chooser>' in html


def test_render_error_names_the_page_element_and_renderer(site):
    write(
        site,
        'src/clock.render.ts',
        "export default { 'tz-chooser': () => { throw new Error('no zones'); } };\n",
    )
    result = build(site)
    assert result.returncode == 1
    assert (
        'content/index.md: <tz-chooser> render failed (src/clock.render.ts): no zones'
        in result.stdout
    )


def test_renderer_that_fails_to_load_fails_the_build(site):
    write(site, 'src/clock.render.ts', "throw new Error('broken renderer');\nexport default {};\n")
    result = build(site)
    assert result.returncode == 1
    assert 'src/clock.render.ts: failed to load: broken renderer' in result.stdout


def test_malformed_renderer_module_fails(site):
    write(site, 'src/clock.render.ts', "export default { chooser: () => '' };\n")
    result = build(site)
    assert result.returncode == 1
    assert 'src/clock.render.ts: "chooser" is not a valid custom element name' in result.stdout


def test_element_without_closing_tag_fails(site):
    write(site, 'content/index.md', page('Home', ['clock.ts'], '<div><tz-chooser></div>'))
    result = build(site)
    assert result.returncode == 1
    assert 'content/index.md: <tz-chooser> needs a closing tag </tz-chooser>' in result.stdout


def test_listing_a_renderer_as_a_script_fails(site):
    write(site, 'content/index.md', page('Home', ['clock.render.ts']))
    result = build(site)
    assert result.returncode == 1
    assert 'scripts[0] "clock.render.ts" is a renderer, which runs at build time' in result.stdout


def test_two_renderers_for_one_script_fail(site):
    write(site, 'src/clock.render.js', "export default { 'tz-chooser': () => '' };\n")
    result = build(site)
    assert result.returncode == 1
    assert 'src/clock.ts: has two renderers' in result.stdout


def test_renderer_imports_outside_src_fail(site):
    write(site, 'outside.ts', 'export const x = 1;\n')
    write(
        site,
        'src/clock.render.ts',
        "import { x } from '../outside';\nexport default { 'tz-chooser': () => String(x) };\n",
    )
    result = build(site)
    assert result.returncode == 1
    assert '"../outside" is outside src/' in result.stdout


def test_package_renderers(tmp_path):
    site = init_site(tmp_path)
    write_package(
        site,
        'tada-map',
        {
            'index.js': 'export default () => {};\n',
            'render.js': (
                'export default { \'tada-map\': () => \'<img alt="Map" src="/map.png">\' };\n'
            ),
        },
        {'type': 'module', 'exports': './index.js', 'tada': {'render': {'.': './render.js'}}},
    )
    write(site, 'public/map.png', 'png')
    write(site, 'content/index.md', page('Home', ['npm:tada-map'], '<tada-map>\n</tada-map>'))
    result = build(site)
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
    assert '<tada-map><img alt="Map" src="/map.png"></tada-map>' in html


def test_package_renderer_that_does_not_exist_fails(tmp_path):
    site = init_site(tmp_path)
    write_package(
        site,
        'tada-map',
        {'index.js': 'export default () => {};\n'},
        {'type': 'module', 'exports': './index.js', 'tada': {'render': {'.': './render.js'}}},
    )
    write(site, 'content/index.md', page('Home', ['npm:tada-map']))
    result = build(site)
    assert result.returncode == 1
    assert (
        'script "npm:tada-map" renderer "./render.js" does not exist in package "tada-map"'
        in result.stdout
    )


def test_watch_rerenders_pages_when_a_renderer_changes(site):
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'index.html'
        assert 'ET (rendered)' in output.read_text(encoding='utf-8')
        mtime = output.stat().st_mtime
        write(site, 'src/clock.render.ts', "export default { 'tz-chooser': () => 'edited' };\n")
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert '<tz-chooser data-zone="ET">edited</tz-chooser>' in output.read_text(
            encoding='utf-8'
        )
    finally:
        wp.stop()


def test_watch_rerenders_pages_when_a_renderer_imports_change(site):
    write(site, 'src/words.ts', "export const word = 'before edit';\n")
    write(
        site,
        'src/clock.render.ts',
        "import { word } from './words';\nexport default { 'tz-chooser': () => word };\n",
    )
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'index.html'
        assert 'before edit' in output.read_text(encoding='utf-8')
        mtime = output.stat().st_mtime
        write(site, 'src/words.ts', "export const word = 'after edit';\n")
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert 'after edit' in output.read_text(encoding='utf-8')
    finally:
        wp.stop()
