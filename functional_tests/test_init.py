import json

from conftest import run_tada


class TestInitDefault:
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
        result = run_tada("init", "mysite", "--default", cwd=str(tmp_path))
        assert result.returncode == 0
        assert "Generated a new site" in result.stdout
        assert "Next steps" in result.stdout


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
