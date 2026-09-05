import pytest
from conftest import init_site, run_tada, set_site_config
from watch_helpers import WatchProcess


@pytest.mark.parametrize('mode', ['dev', 'prod'])
@pytest.mark.parametrize(
    'names',
    [('about.md', 'about.html'), ('demo.py', 'demo.py.html'), ('Demo.java.md', 'Demo.java')],
)
def test_content_output_conflict_rejects_full_build(tmp_path, mode, names):
    site = init_site(tmp_path)
    set_site_config(
        site, {'extensionToShikiLanguage': {'py': 'python'}}, config_file=f'site.{mode}.yaml'
    )
    for name in names:
        (site / 'content' / name).write_text('---\ntitle: Conflict\n---\n\nConflict body\n')
    result = run_tada(mode, cwd=str(site))
    assert result.returncode == 1
    assert 'same path' in result.stderr
    assert names[0] in result.stdout and names[1] in result.stdout
    assert not (site / 'dist' / 'index.html').exists()


@pytest.mark.parametrize('remove_original', [False, True])
def test_watch_content_conflict_recovers_surviving_producer(tmp_path, remove_original):
    site = init_site(tmp_path)
    original = site / 'content' / 'about.md'
    added = site / 'content' / 'about.html'
    original.write_text('---\ntitle: About\n---\n\nMarkdown survivor.\n')
    wp = WatchProcess(site)
    try:
        wp.wait_for_initial_build()
        output = site / 'dist' / 'about.html'
        before = output.read_text()
        added.write_text('---\ntitle: About\n---\n\n<p>HTML survivor.</p>\n')
        wp.wait_for_error()
        assert output.read_text() == before
        (original if remove_original else added).unlink()
        marker = 'HTML survivor.' if remove_original else 'Markdown survivor.'
        wp.wait_for_successful_rebuild()
        assert marker in output.read_text()
        survivor = added if remove_original else original
        mtime = output.stat().st_mtime
        survivor.write_text(survivor.read_text() + '\nUpdated survivor.\n')
        wp.wait_for_rebuild(output, 'modified', before_mtime=mtime)
        assert marker in output.read_text()
        assert 'Updated survivor.' in output.read_text()
    finally:
        wp.stop()
