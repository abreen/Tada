import pytest

from conftest import init_site


class TestTableOfContents:
    """Pages with toc: true render a table of contents nav element."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / "content" / "with-toc.md").write_text(
            "---\ntitle: With TOC\ntoc: true\n---\n\n"
            "## First Section\n\nText.\n\n"
            "!!! note\n"
            "Something to note.\n"
            "!!!\n\n"
            "## Second Section\n\nMore text.\n\n"
            "!!! warning Be careful\n"
            "Danger ahead.\n"
            "!!!\n"
        )

        (site / "content" / "without-toc.md").write_text(
            "---\ntitle: Without TOC\n---\n\n"
            "## A Heading\n\nText.\n"
        )

        yield site

    def test_toc_page_has_nav(self, built_dev_site):
        html = (built_dev_site / "dist" / "with-toc.html").read_text()
        assert 'class="toc"' in html

    def test_toc_nav_contains_heading_links(self, built_dev_site):
        html = (built_dev_site / "dist" / "with-toc.html").read_text()
        toc_start = html.find('class="toc"')
        toc_end = html.find("</nav>", toc_start)
        toc_html = html[toc_start:toc_end]
        assert "First Section" in toc_html
        assert "Second Section" in toc_html
        assert "heading-item" in toc_html

    def test_toc_nav_contains_alert_items(self, built_dev_site):
        html = (built_dev_site / "dist" / "with-toc.html").read_text()
        toc_start = html.find('class="toc"')
        toc_end = html.find("</nav>", toc_start)
        toc_html = html[toc_start:toc_end]
        assert "alert-item" in toc_html
        assert "Note" in toc_html
        assert "Be careful" in toc_html

    def test_toc_page_has_body_class(self, built_dev_site):
        html = (built_dev_site / "dist" / "with-toc.html").read_text()
        assert 'class="default toc-is-active"' in html

    def test_no_toc_page_lacks_nav(self, built_dev_site):
        html = (built_dev_site / "dist" / "without-toc.html").read_text()
        assert 'class="toc"' not in html

    def test_no_toc_page_lacks_body_class(self, built_dev_site):
        html = (built_dev_site / "dist" / "without-toc.html").read_text()
        assert 'class="default toc-is-active"' not in html
