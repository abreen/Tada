from conftest import SITE_PROD_CONFIG_FILE, init_site, run_tada, set_site_config
from watch_helpers import WatchProcess

TYPO_PAGE = '---\ntitle: Home\n---\n\nThis sentense has an misteak.\n'


def site_with_typos(tmp_path):
    site = init_site(tmp_path)
    (site / 'content' / 'index.md').write_text(TYPO_PAGE, encoding='utf-8')
    return site


def html_files(dist):
    return [path.read_text(encoding='utf-8') for path in dist.rglob('*.html')]


def test_watch_underlines_spelling_and_grammar(tmp_path):
    site = site_with_typos(tmp_path)
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        index_html = site / 'dist' / 'index.html'
        html = index_html.read_text(encoding='utf-8')
        assert '<span class="proofread-spelling">sentense</span>' in html
        assert '<span class="proofread-spelling">misteak</span>' in html
        assert '<span class="proofread-grammar">an</span>' in html
        assert '--proofread-spelling-color' in html

        mtime = index_html.stat().st_mtime
        (site / 'content' / 'index.md').write_text(
            TYPO_PAGE + '\nAnother paragraf.\n', encoding='utf-8'
        )
        wp.wait_for_rebuild(index_html, 'modified', before_mtime=mtime)
        assert '<span class="proofread-spelling">paragraf</span>' in index_html.read_text(
            encoding='utf-8'
        )
    finally:
        wp.stop()


def test_watch_accepts_configured_words(tmp_path):
    site = site_with_typos(tmp_path)
    set_site_config(site, {'proofread': {'words': ['sentense']}})
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
        assert '<span class="proofread-spelling">sentense</span>' not in html
        assert '<span class="proofread-spelling">misteak</span>' in html
    finally:
        wp.stop()


def test_watch_does_not_proofread_when_turned_off(tmp_path):
    site = site_with_typos(tmp_path)
    set_site_config(site, {'proofread': False})
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
        assert 'This sentense has an misteak.' in html
        assert 'proofread' not in html
        assert 'Loading Harper' not in wp.stdout_log_path.read_text(encoding='utf-8')
    finally:
        wp.stop()


def test_dev_and_prod_builds_do_not_proofread(tmp_path):
    site = site_with_typos(tmp_path)

    for command in ('dev', 'prod'):
        result = run_tada(command, cwd=str(site))
        assert result.returncode == 0, result.stdout + result.stderr
        assert 'Harper' not in result.stdout + result.stderr

    for dist in (site / 'dist', site / 'dist-prod' / 'v1'):
        pages = html_files(dist)
        assert pages
        assert not any('proofread' in html for html in pages)


def test_prod_config_rejects_proofread(tmp_path):
    site = site_with_typos(tmp_path)
    set_site_config(site, {'proofread': False}, SITE_PROD_CONFIG_FILE)

    result = run_tada('prod', cwd=str(site))
    assert result.returncode != 0
    assert 'proofread is only supported in the development site config' in (
        result.stdout + result.stderr
    )
