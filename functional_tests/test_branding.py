import pytest
from conftest import (
    init_site,
    load_structured_file,
    run_tada,
    set_site_config,
    write_structured_file,
)
from watch_helpers import WatchProcess


def branding_site(tmp_path):
    site = init_site(tmp_path, bare=True)
    assets = site / 'public' / 'branding'
    assets.mkdir()
    (assets / 'logo %.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    (assets / 'icon %.ico').write_bytes(b'custom ICO bytes')
    return site


@pytest.mark.parametrize('mode,config_file', [('dev', 'site.dev.yaml'), ('prod', 'site.prod.yaml')])
def test_custom_branding(tmp_path, mode, config_file):
    site = branding_site(tmp_path)
    set_site_config(
        site,
        {
            'logo': 'branding/logo %.svg',
            'favicon': 'branding/icon %.ico',
            'basePath': '/course',
            'features': {'favicon': True},
        },
        config_file=config_file,
    )
    config_path = site / config_file
    config = load_structured_file(config_path)
    config.pop('symbol', None)
    config.pop('faviconSymbol', None)
    write_structured_file(config_path, config)
    nested = site / 'content' / 'nested'
    nested.mkdir()
    (nested / 'page.md').write_text('---\ntitle: Nested\n---\n\nContent\n')
    result = run_tada(mode, cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    dist = site / ('dist' if mode == 'dev' else 'dist-prod/v1')
    for page in ['index.html', 'nested/page.html']:
        html = (dist / page).read_text()
        assert 'src="/course/branding/logo%20%25.svg"' in html
        assert 'href="/course/branding/icon%20%25.ico"' in html
        assert html.count('rel="icon"') == 1
        assert 'manifest.json' not in html
    for asset in ['logo %.svg', 'icon %.ico']:
        expected = (site / 'public/branding' / asset).read_bytes()
        assert (dist / 'branding' / asset).read_bytes() == expected
    assert not (dist / 'favicon.svg').exists()
    assert not (dist / 'manifest.json').exists()


def test_disabled_favicon_still_validates_and_copies(tmp_path):
    site = branding_site(tmp_path)
    set_site_config(site, {'favicon': 'branding/icon %.ico', 'features': {'favicon': False}})
    assert run_tada('dev', cwd=str(site)).returncode == 0
    assert 'rel="icon"' not in (site / 'dist/index.html').read_text()
    assert (site / 'dist/branding/icon %.ico').exists()
    set_site_config(site, {'favicon': 'missing.ico'})
    result = run_tada('dev', cwd=str(site))
    assert result.returncode != 0
    assert 'missing.ico' in result.stdout + result.stderr


def test_watch_transitions_and_asset_recovery(tmp_path):
    site = branding_site(tmp_path)
    set_site_config(site, {'features': {'favicon': True}})
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        assert (site / 'dist/favicon.svg').exists()
        set_site_config(site, {'logo': 'branding/logo %.svg', 'favicon': 'branding/icon %.ico'})
        wp.wait_for_successful_rebuild()
        assert not (site / 'dist/favicon.svg').exists()
        assert not (site / 'dist/manifest.json').exists()
        before = (site / 'dist/index.html').read_bytes()
        for name in ['logo %.svg', 'icon %.ico']:
            asset = site / 'public/branding' / name
            contents = asset.read_bytes()
            asset.unlink()
            wp.wait_for_error()
            assert (site / 'dist/index.html').read_bytes() == before
            assert (site / 'dist/branding' / name).read_bytes() == contents
            asset.write_bytes(contents)
            wp.wait_for_successful_rebuild()
        config_path = site / 'site.dev.yaml'
        config = load_structured_file(config_path)
        del config['favicon']
        del config['logo']
        write_structured_file(config_path, config)
        wp.wait_for_successful_rebuild()
        assert (site / 'dist/favicon.svg').exists()
        assert (site / 'dist/manifest.json').exists()
    finally:
        wp.stop()


def test_emoji_symbol_requires_text_favicon_symbol(tmp_path):
    site = branding_site(tmp_path)
    set_site_config(site, {'title': 'Test Site', 'symbol': '🚀', 'features': {'favicon': True}})
    config_path = site / 'site.dev.yaml'
    config = load_structured_file(config_path)
    config.pop('faviconSymbol', None)
    write_structured_file(config_path, config)
    result = run_tada('dev', cwd=str(site))
    assert result.returncode != 0
    assert 'faviconSymbol is required when symbol is an emoji' in result.stdout + result.stderr

    set_site_config(site, {'faviconSymbol': 'GO'})
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist/index.html').read_text(encoding='utf-8')
    assert '<span class="logo logo-emoji" aria-hidden="true">🚀</span>' in html
    assert '<meta name="apple-mobile-web-app-title" content="Test Site">' in html
    assert (site / 'dist/favicon.svg').exists()
