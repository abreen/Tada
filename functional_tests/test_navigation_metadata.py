import re

import pytest
from conftest import (
    SITE_DEV_CONFIG_FILE,
    SITE_PROD_CONFIG_FILE,
    init_site,
    run_tada,
    set_site_config,
)
from watch_helpers import WatchProcess


def marked(html, label):
    match = re.search(r'<a\b([^>]*)>' + label + r'</a>', html)
    assert match, f'Missing link: {label}'
    return 'data-tada-page' in match[1]


@pytest.mark.parametrize(
    'command,output,config',
    [
        ('dev', 'dist', SITE_DEV_CONFIG_FILE),
        ('prod', 'dist-prod/v1', SITE_PROD_CONFIG_FILE),
    ],
)
def test_generated_page_markers(tmp_path, command, output, config):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'basePath': '/course'}, config_file=config)
    (site / 'content' / 'destination.md').write_text('---\ntitle: Destination\n---\nContent.\n')
    (site / 'public' / 'copied.html').write_text('<h1>Copied</h1>')
    (site / 'content' / 'metadata.md').write_text(
        '---\ntitle: Metadata\n---\n'
        '<nav><a href="destination.html?x=1#part">Generated</a></nav>\n'
        '<a href="/copied.html" data-tada-page>Copied</a>\n'
        '<a href="/destination.html" download data-tada-page>Download</a>\n'
    )
    result = run_tada(command, cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / output / 'metadata.html').read_text()
    assert marked(html, 'Generated')
    assert not marked(html, 'Copied')
    assert not marked(html, 'Download')
    assert 'href="destination.html?x=1#part"' in html
    assert 'href="/course/copied.html"' in html


def test_watch_reclassifies_route_ownership(tmp_path):
    site = init_site(tmp_path, bare=True)
    copied = site / 'public' / 'destination.html'
    generated = site / 'content' / 'destination.md'
    copied.write_text('<h1>Copied</h1>')
    (site / 'content' / 'metadata.md').write_text(
        '---\ntitle: Metadata\n---\n<nav><a href="/destination.html">Destination</a></nav>\n'
    )
    watch = WatchProcess(site)
    try:
        watch.wait_for_initial_build()
        html = site / 'dist' / 'metadata.html'
        assert not marked(html.read_text(), 'Destination')
        previous = watch.snapshot(html)
        copied.unlink()
        generated.write_text('---\ntitle: Destination\n---\nContent.\n')
        watch.wait_for_rebuild(html, before_mtime=previous)
        assert marked(html.read_text(), 'Destination')
        previous = watch.snapshot(html)
        generated.unlink()
        copied.write_text('<h1>Copied again</h1>')
        watch.wait_for_rebuild(html, before_mtime=previous)
        assert not marked(html.read_text(), 'Destination')
    finally:
        watch.stop()
