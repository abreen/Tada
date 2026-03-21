from conftest import run_tada


class TestClean:
    def test_removes_dist(self, built_dev_site):
        assert (built_dev_site / "dist").exists()
        result = run_tada("clean", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert not (built_dev_site / "dist").exists()

    def test_preserves_font_cache(self, built_dev_site):
        font_cache = built_dev_site / ".font-cache"
        has_cache = font_cache.exists()
        run_tada("clean", cwd=str(built_dev_site))
        if has_cache:
            assert font_cache.exists()

    def test_clean_stdout(self, built_dev_site):
        result = run_tada("clean", cwd=str(built_dev_site))
        assert "Cleaned dist/" in result.stdout

    def test_clean_idempotent(self, site_dir):
        result = run_tada("clean", cwd=str(site_dir))
        assert result.returncode == 0


class TestCleanAll:
    def test_removes_dist_and_font_cache(self, built_dev_site):
        assert (built_dev_site / "dist").exists()
        result = run_tada("clean", "--all", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert not (built_dev_site / "dist").exists()
        assert not (built_dev_site / ".font-cache").exists()

    def test_clean_all_stdout(self, built_dev_site):
        result = run_tada("clean", "--all", cwd=str(built_dev_site))
        assert "Cleaned dist/" in result.stdout
        assert "Cleaned .font-cache/" in result.stdout


class TestRebuildAfterClean:
    def test_can_rebuild_after_clean(self, built_dev_site):
        run_tada("clean", cwd=str(built_dev_site))
        assert not (built_dev_site / "dist").exists()
        result = run_tada("dev", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert (built_dev_site / "dist" / "index.html").exists()

    def test_can_rebuild_after_clean_all(self, built_dev_site):
        run_tada("clean", "--all", cwd=str(built_dev_site))
        result = run_tada("dev", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert (built_dev_site / "dist" / "index.html").exists()
