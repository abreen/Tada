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


class TestCleanPrunesProdVersions:
    def test_keeps_latest_two_prod_builds(self, site_dir):
        for _ in range(4):
            run_tada("prod", cwd=str(site_dir), check=True)

        result = run_tada("clean", cwd=str(site_dir))
        assert result.returncode == 0

        # v1 and v2 should be pruned
        assert not (site_dir / "dist-prod" / "v1").exists()
        assert not (site_dir / "dist-prod" / "v2").exists()
        assert not (site_dir / "dist-prod" / "v1.manifest.json").exists()
        assert not (site_dir / "dist-prod" / "v2.manifest.json").exists()

        # v3 and v4 should be kept
        assert (site_dir / "dist-prod" / "v3").is_dir()
        assert (site_dir / "dist-prod" / "v4").is_dir()
        assert (site_dir / "dist-prod" / "v3.manifest.json").exists()
        assert (site_dir / "dist-prod" / "v4.manifest.json").exists()

    def test_keeps_all_when_two_or_fewer(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        run_tada("prod", cwd=str(site_dir), check=True)

        run_tada("clean", cwd=str(site_dir))

        assert (site_dir / "dist-prod" / "v1").is_dir()
        assert (site_dir / "dist-prod" / "v2").is_dir()

    def test_clean_stdout_mentions_pruning(self, site_dir):
        for _ in range(3):
            run_tada("prod", cwd=str(site_dir), check=True)

        result = run_tada("clean", cwd=str(site_dir))
        assert "Pruned" in result.stdout
        assert "v2" in result.stdout
        assert "v3" in result.stdout


class TestRebuildAfterClean:
    def test_can_rebuild_after_clean(self, built_dev_site):
        run_tada("clean", cwd=str(built_dev_site))
        assert not (built_dev_site / "dist").exists()
        result = run_tada("dev", cwd=str(built_dev_site))
        assert result.returncode == 0
        assert (built_dev_site / "dist" / "index.html").exists()
