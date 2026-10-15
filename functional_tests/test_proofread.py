from html.parser import HTMLParser

from conftest import SITE_PROD_CONFIG_FILE, init_site, run_tada, set_site_config
from watch_helpers import WatchProcess

TYPO_PAGE = '---\ntitle: Home\n---\n\nThis sentense has an misteak.\n'


def site_with_typos(tmp_path):
    site = init_site(tmp_path)
    (site / 'content' / 'index.md').write_text(TYPO_PAGE, encoding='utf-8')
    return site


class _MarkParser(HTMLParser):
    """Collects (kind, text) for proofread spans that carry Harper's message."""

    def __init__(self):
        super().__init__()
        self.marks = []
        self._open = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        kinds = [
            name.removeprefix('proofread-')
            for name in (attrs.get('class') or '').split()
            if name.startswith('proofread-')
        ]
        if tag == 'span' and kinds and attrs.get('title') and attrs.get('data-proofread-message'):
            self._open = [kinds[0], '']

    def handle_data(self, data):
        if self._open is not None:
            self._open[1] += data

    def handle_endtag(self, tag):
        if tag == 'span' and self._open is not None:
            self.marks.append(tuple(self._open))
            self._open = None


def marked(html, kind, text):
    """Whether `text` is underlined as a `kind` problem, with Harper's message."""
    parser = _MarkParser()
    parser.feed(html)
    return (kind, text) in parser.marks


def html_files(dist):
    return [path.read_text(encoding='utf-8') for path in dist.rglob('*.html')]


def test_watch_underlines_spelling_and_grammar(tmp_path):
    site = site_with_typos(tmp_path)
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        index_html = site / 'dist' / 'index.html'
        html = index_html.read_text(encoding='utf-8')
        assert marked(html, 'spelling', 'sentense')
        assert marked(html, 'spelling', 'misteak')
        assert marked(html, 'grammar', 'an')
        assert '--proofread-spelling-color' in html

        mtime = index_html.stat().st_mtime
        (site / 'content' / 'index.md').write_text(
            TYPO_PAGE + '\nAnother paragraf.\n', encoding='utf-8'
        )
        wp.wait_for_rebuild(index_html, 'modified', before_mtime=mtime)
        assert marked(index_html.read_text(encoding='utf-8'), 'spelling', 'paragraf')
    finally:
        wp.stop()


def test_watch_accepts_configured_words(tmp_path):
    site = site_with_typos(tmp_path)
    set_site_config(site, {'proofread': {'words': ['sentense']}})
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
        assert not marked(html, 'spelling', 'sentense')
        assert marked(html, 'spelling', 'misteak')
    finally:
        wp.stop()


def test_watch_applies_configured_rules(tmp_path):
    site = site_with_typos(tmp_path)
    set_site_config(site, {'proofread': {'rules': {'SpellCheck': False, 'NoSuchRule': False}}})
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        html = (site / 'dist' / 'index.html').read_text(encoding='utf-8')
        assert not marked(html, 'spelling', 'sentense')
        assert marked(html, 'grammar', 'an')
        assert 'Harper has no proofread rules named NoSuchRule' in (
            wp.stdout_log_path.read_text(encoding='utf-8')
        )
    finally:
        wp.stop()


def test_watch_checks_the_configured_dialect(tmp_path):
    site = init_site(tmp_path)
    (site / 'content' / 'index.md').write_text(
        '---\ntitle: Home\n---\n\nThe colour is red.\n', encoding='utf-8'
    )
    set_site_config(site, {'proofread': {'dialect': 'british'}})
    wp = WatchProcess(site, proofread=True)
    try:
        wp.wait_for_initial_build()
        index_html = site / 'dist' / 'index.html'
        assert not marked(index_html.read_text(encoding='utf-8'), 'spelling', 'colour')

        mtime = index_html.stat().st_mtime
        (site / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\nThe color is red.\n', encoding='utf-8'
        )
        wp.wait_for_rebuild(index_html, 'modified', before_mtime=mtime)
        assert marked(index_html.read_text(encoding='utf-8'), 'spelling', 'color')
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
