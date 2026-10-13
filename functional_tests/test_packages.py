import json
import re
import shutil

from conftest import (
    PACKAGE_DIR,
    SITE_PROD_CONFIG_FILE,
    init_site,
    run_tada,
    set_site_config,
)
from watch_helpers import WatchProcess

SOURCE_SERIF_REGULAR = (
    PACKAGE_DIR / 'fonts' / 'source-serif-4' / 'woff2' / 'SourceSerif4-VariableFont_opsz,wght.woff2'
)


def write_package(site, name, files, manifest=None):
    """Install a fake package in the site's node_modules, without a network."""
    package_dir = site.joinpath('node_modules', *name.split('/'))
    package_dir.mkdir(parents=True)
    package_json = {'name': name, 'version': '1.0.0', **(manifest or {})}
    (package_dir / 'package.json').write_text(json.dumps(package_json), encoding='utf-8')
    for relative, content in files.items():
        path = package_dir.joinpath(*relative.split('/'))
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding='utf-8')
    return package_dir


def write_font_package(site):
    # The exports map hides the font files from JavaScript imports; config
    # values find them by path anyway
    return write_package(
        site,
        '@fontsource-test/literata',
        {
            'index.js': 'export {};\n',
            'files/literata-400.woff2': SOURCE_SERIF_REGULAR.read_bytes(),
        },
        {'exports': {'.': './index.js'}},
    )


def output_text(result):
    return result.stdout + result.stderr


def test_custom_font_from_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    package_dir = write_font_package(site)
    set_site_config(
        site,
        {
            'basePath': '/course',
            'defaultFont': 'serif',
            'fontOverrides': {
                'serif': {'regular': 'npm:@fontsource-test/literata/files/literata-400.woff2'},
            },
        },
    )

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)

    dist = site / 'dist'
    published = dist.joinpath(
        '_packages', '@fontsource-test', 'literata', 'files', 'literata-400.woff2'
    )
    source = package_dir / 'files' / 'literata-400.woff2'
    assert published.read_bytes() == source.read_bytes()
    html = (dist / 'index.html').read_text(encoding='utf-8')
    assert (
        'rel="preload" '
        'href="/course/_packages/%40fontsource-test/literata/files/literata-400.woff2"'
    ) in html
    css = ''.join(file.read_text(encoding='utf-8') for file in dist.glob('*.css'))
    assert 'url("_packages/%40fontsource-test/literata/files/literata-400.woff2")' in css
    assert not (dist / 'node_modules').exists()


def test_rejects_custom_font_from_missing_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(
        site,
        {'fontOverrides': {'serif': {'regular': 'npm:@fontsource-test/literata/files/a.woff2'}}},
    )

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'fontOverrides.serif.regular "npm:@fontsource-test/literata/files/a.woff2" needs package '
        '"@fontsource-test/literata", which is not installed; run bun install'
    ) in output_text(result)


def test_rejects_custom_font_missing_from_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_font_package(site)
    missing = 'npm:@fontsource-test/literata/files/missing.woff2'
    set_site_config(site, {'fontOverrides': {'serif': {'regular': missing}}})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'fontOverrides.serif.regular "npm:@fontsource-test/literata/files/missing.woff2" '
        'does not exist in package "@fontsource-test/literata"'
    ) in output_text(result)


def test_rejects_malformed_package_font_path(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'fontOverrides': {'serif': {'regular': 'npm:Bad/a.woff2'}}})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'fontOverrides.serif.regular must be a public-relative POSIX path or an npm: path, '
        'ending in .woff2'
    ) in output_text(result)


def test_branding_from_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_package(
        site,
        'course-brand',
        {
            'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
            'icons/favicon.ico': b'custom ICO bytes',
        },
    )
    set_site_config(
        site,
        {
            'basePath': '/course',
            'logo': 'npm:course-brand/logo.svg',
            'favicon': 'npm:course-brand/icons/favicon.ico',
            'features': {'favicon': True},
        },
        config_file=SITE_PROD_CONFIG_FILE,
    )

    result = run_tada('prod', cwd=str(site))
    assert result.returncode == 0, output_text(result)

    dist = site / 'dist-prod' / 'v1'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    assert 'src="/course/_packages/course-brand/logo.svg"' in html
    assert 'href="/course/_packages/course-brand/icons/favicon.ico"' in html
    assert (dist / '_packages' / 'course-brand' / 'icons' / 'favicon.ico').read_bytes() == (
        b'custom ICO bytes'
    )


def test_rejects_branding_from_missing_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'logo': 'npm:course-brand/logo.svg'})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'logo "npm:course-brand/logo.svg" needs package "course-brand", which is not '
        'installed; run bun install'
    ) in output_text(result)


def test_rejects_public_file_that_conflicts_with_package_asset(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_package(site, 'course-brand', {'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>'})
    conflict = site / 'public' / '_packages' / 'course-brand'
    conflict.mkdir(parents=True)
    (conflict / 'logo.svg').write_text('<svg/>', encoding='utf-8')
    set_site_config(site, {'logo': 'npm:course-brand/logo.svg'})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'public/_packages/course-brand/logo.svg: conflicts with '
        '_packages/course-brand/logo.svg generated by Tada'
    ) in output_text(result)


def test_package_assets_are_not_copied_from_node_modules_otherwise(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_font_package(site)

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)
    assert not (site / 'dist' / '_packages').exists()


def test_package_font_copied_into_public_still_works(tmp_path):
    # A site that copied package files into public/ keeps working unchanged
    site = init_site(tmp_path, bare=True)
    fonts = site / 'public' / 'fonts'
    fonts.mkdir()
    shutil.copyfile(SOURCE_SERIF_REGULAR, fonts / 'a.woff2')
    set_site_config(site, {'fontOverrides': {'serif': {'regular': 'fonts/a.woff2'}}})

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)
    assert (site / 'dist' / 'fonts' / 'a.woff2').exists()


SCRIPT_MARKER = re.compile(r'<link rel="modulepreload" href="([^"]+)" data-tada-script>')


def page(title, scripts=None, body='Body'):
    front_matter = f'title: {title}\n'
    if scripts is not None:
        front_matter += f'scripts: [{", ".join(scripts)}]\n'
    return f'---\n{front_matter}---\n\n{body}\n'


def write(site, relative, text):
    path = site.joinpath(*relative.split('/'))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return path


def write_greet_package(site):
    return write_package(
        site,
        'tada-greet',
        {
            'index.js': (
                "import { shout } from 'shared-lib';\n"
                'export default ({ window }) => {\n'
                "  window.document.body.dataset.greet = shout('package mounted');\n"
                '};\n'
            ),
            'extra.js': 'export default () => {};\nconsole.log("extra loaded");\n',
            'hidden.js': 'export default () => {};\n',
            'side-effect.js': 'console.log("side effect only");\n',
        },
        {
            'type': 'module',
            'exports': {
                '.': './index.js',
                './extra': './extra.js',
                './side-effect': './side-effect.js',
            },
        },
    )


def write_shared_lib(site):
    write_package(
        site,
        'shared-lib',
        {'index.js': "export const shout = text => text.toUpperCase() + ' (shared lib)';\n"},
        {'type': 'module', 'exports': './index.js'},
    )


def test_scripts_from_packages(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_shared_lib(site)
    write_greet_package(site)
    write_package(
        site,
        '@course/widgets',
        {'index.js': 'export default () => {};\nconsole.log("scoped widget");\n'},
        {'type': 'module', 'exports': './index.js'},
    )
    write(
        site,
        'src/local.ts',
        "import { shout } from 'shared-lib';\n"
        "export default () => { console.log(shout('local')); };\n",
    )
    set_site_config(site, {'scripts': ['npm:tada-greet']})
    write(
        site,
        'content/index.md',
        page('Home', ['local.ts', 'npm:tada-greet/extra', 'npm:@course/widgets', 'npm:tada-greet']),
    )

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)

    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    assert SCRIPT_MARKER.findall(html) == [
        '/_scripts/_npm~tada-greet.js',
        '/_scripts/local.js',
        '/_scripts/_npm~tada-greet~extra.js',
        '/_scripts/_npm~@course~widgets.js',
    ]
    entry = (dist / '_scripts' / '_npm~tada-greet.js').read_text(encoding='utf-8')
    assert 'package mounted' in entry
    assert 'export' in entry and 'default' in entry
    assert 'extra loaded' in (dist / '_scripts' / '_npm~tada-greet~extra.js').read_text(
        encoding='utf-8'
    )
    assert 'scoped widget' in (dist / '_scripts' / '_npm~@course~widgets.js').read_text(
        encoding='utf-8'
    )
    # The package and src/ share one copy of the library they both import
    chunks = list((dist / '_scripts' / 'chunks').glob('*.js'))
    shared = [
        file for file in dist.rglob('*.js') if '(shared lib)' in file.read_text(encoding='utf-8')
    ]
    assert len(shared) == 1 and shared[0] in chunks
    assert not (dist / 'node_modules').exists()


def test_package_script_without_default_export(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_greet_package(site)
    write_shared_lib(site)
    write(site, 'content/index.md', page('Home', ['npm:tada-greet/side-effect']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)
    script = site / 'dist' / '_scripts' / '_npm~tada-greet~side-effect.js'
    assert 'side effect only' in script.read_text(encoding='utf-8')


def test_package_scripts_are_hashed_in_production(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_greet_package(site)
    write_shared_lib(site)
    write(site, 'content/index.md', page('Home', ['npm:tada-greet']))

    result = run_tada('prod', cwd=str(site))
    assert result.returncode == 0, output_text(result)
    html = (site / 'dist-prod' / 'v1' / 'index.html').read_text(encoding='utf-8')
    [href] = SCRIPT_MARKER.findall(html)
    assert re.fullmatch(r'/_scripts/_npm~tada-greet-[a-z0-9]+\.js', href), href


def test_rejects_site_script_from_missing_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'scripts': ['npm:tada-greet']})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'scripts[0] "npm:tada-greet" needs package "tada-greet", which is not installed; '
        'run bun install'
    ) in output_text(result)


def test_rejects_page_script_from_missing_package(tmp_path):
    site = init_site(tmp_path, bare=True)
    write(site, 'content/index.md', page('Home', ['npm:tada-greet']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'content/index.md: script "npm:tada-greet" needs package "tada-greet", which is not '
        'installed; run bun install'
    ) in output_text(result)


def test_rejects_package_script_the_package_does_not_export(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_greet_package(site)
    write(site, 'content/index.md', page('Home', ['npm:tada-greet/hidden']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    output = output_text(result)
    assert 'script "npm:tada-greet/hidden" is not exported by package "tada-greet"' in output
    assert 'bun install' not in output


def test_rejects_malformed_package_script(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'scripts': ['npm:Bad']})

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'scripts[0] "npm:Bad" must name an npm package, such as npm:name or npm:@scope/name/path'
    ) in output_text(result)


def test_rejects_src_scripts_with_reserved_package_prefix(tmp_path):
    site = init_site(tmp_path, bare=True)
    write(site, 'src/_npm~x.ts', 'export default () => {};\n')
    write(site, 'content/index.md', page('Home', ['_npm~x.ts']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'content/index.md: scripts[0] "_npm~x.ts" must not start with _npm~, which Tada uses '
        'for packages'
    ) in output_text(result)


STYLE_LINK = re.compile(r'<link href="([^"]+)" rel="stylesheet" data-tada-style>')

# Large enough that Bun writes a file instead of inlining a data URL
IMAGE_BYTES = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF]) * 25000


def page_styles(dist, html):
    return [dist.joinpath(*href.lstrip('/').split('/')) for href in STYLE_LINK.findall(html)]


def css_url_targets(css_file):
    css = css_file.read_text(encoding='utf-8')
    urls = re.findall(r'url\("?([^")]+)"?\)', css)
    return [css_file.parent.joinpath(*url.split('/')) for url in urls]


def test_package_css_with_images(tmp_path):
    # Like Leaflet: the package's script imports its stylesheet, which refers to
    # images next to it and in a sibling directory
    site = init_site(tmp_path, bare=True)
    write_package(
        site,
        'leafy',
        {
            'dist/leafy.js': "import './leafy.css';\nexport default () => {};\n",
            'dist/leafy.css': (
                '.leafy-layers { background: url(images/layers.png); }\n'
                '.leafy-marker { background: url(../img/marker.png); }\n'
            ),
            'dist/images/layers.png': IMAGE_BYTES,
            'img/marker.png': IMAGE_BYTES[::-1],
        },
        {'type': 'module', 'exports': './dist/leafy.js'},
    )
    write(site, 'content/index.md', page('Home', ['npm:leafy']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)

    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    [style] = page_styles(dist, html)
    assert '.leafy-layers' in style.read_text(encoding='utf-8')
    layers, marker = css_url_targets(style)
    assert layers.read_bytes() == IMAGE_BYTES
    assert marker.read_bytes() == IMAGE_BYTES[::-1]
    for target in (layers, marker):
        assert target.resolve().parent == (dist / '_scripts' / 'assets').resolve()


def test_package_scss_and_sass_package_imports(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_package(
        site,
        'scss-kit',
        {
            'index.js': "import './kit.scss';\nexport default () => {};\n",
            'kit.scss': "@use 'sizes';\n.kit { margin: sizes.$gap; }\n",
            '_sizes.scss': '$gap: 7px;\n',
        },
        {'type': 'module', 'exports': {'.': './index.js', './*': './*'}},
    )
    write(
        site,
        'src/local.ts',
        "import './local.scss';\nexport default () => {};\n",
    )
    write(
        site,
        'src/local.scss',
        "@use 'pkg:scss-kit/sizes';\n.local { padding: sizes.$gap; }\n",
    )
    write(site, 'content/index.md', page('Home', ['npm:scss-kit', 'local.ts']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)

    dist = site / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    css = ''.join(file.read_text(encoding='utf-8') for file in page_styles(dist, html))
    assert re.search(r'\.kit\s*\{\s*margin:\s*7px', css)
    assert re.search(r'\.local\s*\{\s*padding:\s*7px', css)


def test_src_stylesheet_still_cannot_load_sass_outside_src(tmp_path):
    site = init_site(tmp_path, bare=True)
    write(site, 'shared/_colors.scss', '$accent: red;\n')
    write(site, 'src/local.ts', "import './local.scss';\nexport default () => {};\n")
    write(site, 'src/local.scss', "@use '../shared/colors';\n.local { color: colors.$accent; }\n")
    write(site, 'content/index.md', page('Home', ['local.ts']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert '"../shared/_colors.scss" is outside src/' in output_text(result)


def test_watch_adds_package_scripts_listed_in_front_matter(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_greet_package(site)
    write_shared_lib(site)
    write(site, 'content/about.md', page('About'))
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'about.html'
        assert SCRIPT_MARKER.findall(output.read_text(encoding='utf-8')) == []
        mtime = output.stat().st_mtime
        write(site, 'content/about.md', page('About', ['npm:tada-greet']))
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert SCRIPT_MARKER.findall(output.read_text(encoding='utf-8')) == [
            '/_scripts/_npm~tada-greet.js'
        ]
        assert (site / 'dist' / '_scripts' / '_npm~tada-greet.js').is_file()
    finally:
        wp.stop()


def test_package_script_with_only_a_browser_export(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_package(
        site,
        'browser-only',
        {'browser.js': 'export default () => {};\nconsole.log("browser build");\n'},
        {'type': 'module', 'exports': {'.': {'browser': './browser.js'}}},
    )
    write(site, 'content/index.md', page('Home', ['npm:browser-only']))

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, output_text(result)
    script = site / 'dist' / '_scripts' / '_npm~browser-only.js'
    assert 'browser build' in script.read_text(encoding='utf-8')


def test_site_under_a_node_modules_directory_keeps_sass_in_src(tmp_path):
    parent = tmp_path / 'node_modules'
    parent.mkdir()
    site = init_site(parent, bare=True)
    write(site, 'shared/_colors.scss', '$accent: red;\n')
    write(site, 'src/local.ts', "import './local.scss';\nexport default () => {};\n")
    write(site, 'src/local.scss', "@use '../shared/colors';\n.local { color: colors.$accent; }\n")
    write(site, 'content/index.md', page('Home', ['local.ts']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert '"../shared/_colors.scss" is outside src/' in output_text(result)


def test_rejects_src_file_where_a_package_entry_goes(tmp_path):
    site = init_site(tmp_path, bare=True)
    write_greet_package(site)
    write_shared_lib(site)
    write(site, 'src/_npm~tada-greet.js', 'export const mine = "author file";\n')
    write(
        site,
        'src/site.ts',
        "import { mine } from './_npm~tada-greet.js';\nexport default () => console.log(mine);\n",
    )
    write(site, 'content/index.md', page('Home', ['site.ts', 'npm:tada-greet']))

    result = run_tada('dev', cwd=str(site))

    assert result.returncode != 0
    assert (
        'src/_npm~tada-greet.js: Tada compiles "npm:tada-greet" from this path; rename the file'
    ) in output_text(result)
