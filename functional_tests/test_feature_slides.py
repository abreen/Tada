import re

from conftest import init_site, run_tada


class TestSlidesFeature:
    def test_html_content_pages_cannot_enable_slides(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'content' / 'slides.html').write_text(
            '---\ntitle: HTML Slides\nslides: true\n---\n\n<p>Hello</p>\n'
        )

        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert 'slides.html: slides mode is only supported on Markdown pages' in output

    def test_slide_pages_render_slide_markup_and_present_control(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'content' / 'slides.md').write_text(
            '---\n'
            'title: Slide Deck\n'
            'slides: true\n'
            '---\n'
            '\n'
            '# First Slide\n'
            '\n'
            'Intro content.\n'
            '\n'
            '---\n'
            '\n'
            '# Second Slide\n'
            '\n'
            'More content.\n'
        )
        (site / 'content' / 'plain.md').write_text(
            '---\n'
            'title: Plain Page\n'
            '---\n'
            '\n'
            '# Plain Content\n'
            '\n'
            'Paragraph before separator.\n'
            '\n'
            '---\n'
            '\n'
            'Paragraph after separator.\n'
        )

        result = run_tada('dev', cwd=str(site))
        assert result.returncode == 0, f'dev build failed: {result.stderr}'

        slides_html = (site / 'dist' / 'slides.html').read_text()
        plain_html = (site / 'dist' / 'plain.html').read_text()

        slide_main_match = re.search(
            r'<main class="body" data-pagefind-body(?:="")?>',
            slides_html,
        )
        slide_header_match = re.search(
            r'<div class="slides-header" data-pagefind-ignore(?:="")?>',
            slides_html,
        )
        slide_button_match = re.search(
            r'<button type="button" data-slides-present(?:="")? disabled(?:="")?>Present</button>',
            slides_html,
        )
        slide_fullscreen_checkbox_match = re.search(
            r'<input id="slides-fullscreen" type="checkbox" data-slides-fullscreen(?:="")? '
            r'checked(?:="")? disabled(?:="")?>\s*Full screen',
            slides_html,
        )

        assert 'data-slides-root' in slides_html
        assert 'class="slide"' in slides_html
        assert 'class="file-header"' not in slides_html
        assert '<hr' not in slides_html
        assert slide_main_match is not None
        assert slide_header_match is not None
        assert slide_button_match is not None
        assert slide_fullscreen_checkbox_match is not None
        assert slide_main_match.start() < slide_header_match.start()
        assert slide_header_match.start() < slide_button_match.start()
        assert slide_button_match.end() < slide_fullscreen_checkbox_match.start()
        assert slide_fullscreen_checkbox_match.end() < slides_html.index(
            '</div>',
            slide_header_match.start(),
        )

        assert '<hr' in plain_html
        assert 'data-slides-present' not in plain_html
        assert 'data-slides-fullscreen' not in plain_html
        assert 'data-slides-root' not in plain_html
