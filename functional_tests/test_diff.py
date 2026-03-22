"""Functional tests for tada diff."""

import json
import os

from conftest import run_tada


class TestDiffErrors:
    def test_fails_without_any_build(self, site_dir):
        result = run_tada("diff", cwd=str(site_dir))
        assert result.returncode == 1
        assert "No prod builds found" in result.stderr

    def test_fails_with_only_one_build(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        result = run_tada("diff", cwd=str(site_dir))
        assert result.returncode == 1
        assert "at least two" in result.stderr

    def test_fails_with_one_version_arg(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        run_tada("prod", cwd=str(site_dir), check=True)
        result = run_tada("diff", "1", cwd=str(site_dir))
        assert result.returncode == 1
        assert "zero or two" in result.stderr


class TestDiffNoChanges:
    def test_no_changes_between_identical_builds(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        run_tada("prod", cwd=str(site_dir), check=True)
        result = run_tada("diff", cwd=str(site_dir))
        assert result.returncode == 0
        assert "No changes" in result.stdout
        assert "v1" in result.stdout
        assert "v2" in result.stdout


class TestDiffWithChanges:
    def test_detects_changed_content(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nUpdated content.\n")

        run_tada("prod", cwd=str(site_dir), check=True)

        result = run_tada("diff", cwd=str(site_dir))
        assert result.returncode == 0
        assert "Changed" in result.stdout
        assert "index.html" in result.stdout

    def test_detects_added_page(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        new_page = site_dir / "content" / "new-page.md"
        new_page.write_text("title: New Page\n\nNew page content.\n")

        run_tada("prod", cwd=str(site_dir), check=True)

        result = run_tada("diff", cwd=str(site_dir))
        assert result.returncode == 0
        assert "Added" in result.stdout
        assert "new-page.html" in result.stdout

    def test_shows_total_count(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nChanged.\n")

        run_tada("prod", cwd=str(site_dir), check=True)

        result = run_tada("diff", cwd=str(site_dir))
        assert "file(s) differ" in result.stdout


class TestDiffExplicitVersions:
    def test_compare_specific_versions(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)  # v1

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nVersion 2.\n")
        run_tada("prod", cwd=str(site_dir), check=True)  # v2

        index_md.write_text("title: Home\n\nVersion 3.\n")
        run_tada("prod", cwd=str(site_dir), check=True)  # v3

        result = run_tada("diff", "1", "3", cwd=str(site_dir))
        assert result.returncode == 0
        assert "v1" in result.stdout
        assert "v3" in result.stdout

    def test_version_order_is_normalized(self, site_dir):
        """tada diff 2 1 produces the same result as tada diff 1 2."""
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nChanged.\n")
        run_tada("prod", cwd=str(site_dir), check=True)

        result_forward = run_tada("diff", "1", "2", cwd=str(site_dir))
        result_backward = run_tada("diff", "2", "1", cwd=str(site_dir))
        assert result_forward.stdout == result_backward.stdout


class TestDiffCopy:
    def test_copies_changed_files(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nNew content.\n")

        run_tada("prod", cwd=str(site_dir), check=True)

        upload_dir = site_dir / "upload"
        result = run_tada(
            "diff", "--copy", str(upload_dir), cwd=str(site_dir),
        )
        assert result.returncode == 0
        assert upload_dir.exists()
        assert "Copied" in result.stdout
        assert (upload_dir / "manifest.json").exists()

    def test_copied_dir_has_fewer_files_than_dist(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nMinor change.\n")

        run_tada("prod", cwd=str(site_dir), check=True)

        upload_dir = site_dir / "upload"
        run_tada("diff", "--copy", str(upload_dir), cwd=str(site_dir))

        new_dist = site_dir / "dist-prod" / "v2"
        dist_files = set()
        for root, _, files in os.walk(new_dist):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), new_dist)
                if not rel.startswith("pagefind"):
                    dist_files.add(rel)

        upload_files = set()
        for root, _, files in os.walk(upload_dir):
            for f in files:
                upload_files.add(
                    os.path.relpath(os.path.join(root, f), upload_dir)
                )

        assert len(upload_files) > 0
        assert len(upload_files) < len(dist_files)

    def test_copy_with_explicit_versions(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md = site_dir / "content" / "index.md"
        index_md.write_text("title: Home\n\nV2.\n")
        run_tada("prod", cwd=str(site_dir), check=True)

        index_md.write_text("title: Home\n\nV3.\n")
        run_tada("prod", cwd=str(site_dir), check=True)

        upload_dir = site_dir / "upload"
        result = run_tada(
            "diff", "1", "3", "--copy", str(upload_dir), cwd=str(site_dir),
        )
        assert result.returncode == 0
        assert "Copied" in result.stdout


class TestManifestCreation:
    def test_prod_build_creates_manifest(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        manifest_path = site_dir / "dist-prod" / "v1.manifest.json"
        assert manifest_path.exists()

        manifest = json.loads(manifest_path.read_text())
        assert manifest["version"] == 1
        assert "buildTime" in manifest
        assert len(manifest["files"]) > 0

    def test_dev_build_does_not_create_dist_prod(self, site_dir):
        run_tada("dev", cwd=str(site_dir), check=True)
        assert not (site_dir / "dist-prod").exists()

    def test_manifest_excludes_pagefind(self, built_prod_site):
        manifest = json.loads(
            (built_prod_site / "dist-prod" / "v1.manifest.json").read_text()
        )
        pagefind_keys = [
            k for k in manifest["files"] if k.startswith("pagefind")
        ]
        assert len(pagefind_keys) == 0

    def test_multiple_builds_increment_versions(self, site_dir):
        run_tada("prod", cwd=str(site_dir), check=True)
        run_tada("prod", cwd=str(site_dir), check=True)
        run_tada("prod", cwd=str(site_dir), check=True)

        assert (site_dir / "dist-prod" / "v1").is_dir()
        assert (site_dir / "dist-prod" / "v2").is_dir()
        assert (site_dir / "dist-prod" / "v3").is_dir()
        assert (site_dir / "dist-prod" / "v1.manifest.json").exists()
        assert (site_dir / "dist-prod" / "v2.manifest.json").exists()
        assert (site_dir / "dist-prod" / "v3.manifest.json").exists()
