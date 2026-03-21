from conftest import run_tada


class TestClean:
    def test_removes_dist(self, built_dev_site):
        assert (built_dev_site / "dist").exists()
        result = run_tada("clean", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert not (built_dev_site / "dist").exists()

    def test_clean_stdout(self, built_dev_site):
        result = run_tada("clean", cwd=str(built_dev_site))
        assert "Cleaned dist/" in result.stdout

    def test_clean_idempotent(self, site_dir):
        result = run_tada("clean", cwd=str(site_dir))
        assert result.returncode == 0


class TestRebuildAfterClean:
    def test_can_rebuild_after_clean(self, built_dev_site):
        run_tada("clean", cwd=str(built_dev_site))
        assert not (built_dev_site / "dist").exists()
        result = run_tada("dev", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert (built_dev_site / "dist" / "index.html").exists()
