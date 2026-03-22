import json

import pytest

from conftest import run_tada


class TestInitDefault:
    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"
        assert site.is_dir()
        yield site

    def test_creates_site_directory(self, site_dir):
        assert site_dir.is_dir()

    def test_creates_dev_config(self, site_dir):
        config_path = site_dir / "site.dev.json"
        assert config_path.exists()
        config = json.loads(config_path.read_text())
        assert config["base"] == "http://localhost:8080"
        assert config["basePath"] == "/"
        assert "title" in config

    def test_creates_prod_config(self, site_dir):
        config_path = site_dir / "site.prod.json"
        assert config_path.exists()
        config = json.loads(config_path.read_text())
        assert "base" in config
        assert "basePath" in config

    def test_creates_nav_json(self, site_dir):
        nav_path = site_dir / "nav.json"
        assert nav_path.exists()
        nav = json.loads(nav_path.read_text())
        assert isinstance(nav, list)
        assert len(nav) > 0

    def test_creates_authors_json(self, site_dir):
        authors_path = site_dir / "authors.json"
        assert authors_path.exists()
        authors = json.loads(authors_path.read_text())
        assert isinstance(authors, dict)

    def test_copies_content_directory(self, site_dir):
        content_dir = site_dir / "content"
        assert content_dir.is_dir()
        assert (content_dir / "index.md").exists()

    def test_copies_public_directory(self, site_dir):
        public_dir = site_dir / "public"
        assert public_dir.is_dir()

    def test_copies_nested_content(self, site_dir):
        assert (site_dir / "content" / "lectures" / "index.md").exists()
        assert (site_dir / "content" / "lectures" / "01" / "index.md").exists()

    def test_stdout_contains_success_message(self, tmp_path):
        result = run_tada("init", "mysite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0
        assert "Generated a new site" in result.stdout
        assert "Next steps" in result.stdout


class TestInitBare:
    def test_creates_site_directory(self, site_dir):
        assert site_dir.is_dir()

    def test_creates_configs(self, site_dir):
        assert (site_dir / "site.dev.json").exists()
        assert (site_dir / "site.prod.json").exists()

    def test_creates_minimal_content(self, site_dir):
        content_dir = site_dir / "content"
        assert content_dir.is_dir()
        assert (content_dir / "index.md").exists()
        all_files = [f for f in content_dir.rglob("*") if f.is_file()]
        assert len(all_files) == 1

    def test_creates_empty_public(self, site_dir):
        public_dir = site_dir / "public"
        assert public_dir.is_dir()
        assert len(list(public_dir.rglob("*"))) == 0

    def test_creates_minimal_nav(self, site_dir):
        import json

        nav = json.loads((site_dir / "nav.json").read_text())
        assert len(nav) == 1
        assert len(nav[0]["links"]) == 1
        assert nav[0]["links"][0]["text"] == "Home"

    def test_no_authors_json(self, site_dir):
        assert not (site_dir / "authors.json").exists()


class TestInitNoInteractiveFlags:
    def test_prod_base_path_flag(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--prod-base-path", "/test",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0
        config = json.loads((tmp_path / "testsite" / "site.prod.json").read_text())
        assert config["basePath"] == "/test"

    def test_prod_base_flag(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--prod-base", "https://myschool.edu",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0
        config = json.loads((tmp_path / "testsite" / "site.prod.json").read_text())
        assert config["base"] == "https://myschool.edu"
        assert "myschool.edu" in config["internalDomains"]

    def test_title_flag(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--title", "My Course",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0
        config = json.loads((tmp_path / "testsite" / "site.dev.json").read_text())
        assert config["title"] == "My Course"

    def test_invalid_flag_value_exits_1(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--prod-base", "not-a-url",
            cwd=str(tmp_path),
        )
        assert result.returncode == 1
        assert "Error" in result.stderr

    def test_unknown_flag_exits_1(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--nonexistent", "value",
            cwd=str(tmp_path),
        )
        assert result.returncode == 1

    def test_multiple_flags(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--title", "CS 101",
            "--symbol", "CS 1",
            "--prod-base", "https://example.edu",
            "--prod-base-path", "/cs101",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0
        dev = json.loads((tmp_path / "testsite" / "site.dev.json").read_text())
        prod = json.loads((tmp_path / "testsite" / "site.prod.json").read_text())
        assert dev["title"] == "CS 101"
        assert dev["symbol"] == "CS 1"
        assert prod["basePath"] == "/cs101"


class TestInitErrors:
    def test_no_dirname_exits_1(self, tmp_path):
        result = run_tada("init", cwd=str(tmp_path))
        assert result.returncode == 1
        assert "Provide a name" in result.stderr

    def test_existing_directory_exits_1(self, tmp_path):
        (tmp_path / "exists").mkdir()
        result = run_tada("init", "exists", cwd=str(tmp_path))
        assert result.returncode == 1
        assert "already exists" in result.stderr
