from conftest import (
    AUTHORS_CONFIG_FILE,
    NAV_CONFIG_FILE,
    SITE_DEV_CONFIG_FILE,
    SITE_PROD_CONFIG_FILE,
    init_site,
    load_structured_file,
    run_tada,
    set_site_config,
    write_structured_file,
)


def rewrite_config_variant(site_dir, old_name, new_name):
    value = load_structured_file(site_dir / old_name)
    write_structured_file(site_dir / new_name, value)
    (site_dir / old_name).unlink()


class TestConfigFileVariants:
    def test_dev_build_interpolates_yaml_nav_values_safely(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {'title': 'CS 101: Intro'})
        (site / NAV_CONFIG_FILE).write_text(
            '\n'.join(
                [
                    '- title: Welcome to <%= site.title %>',
                    '  links:',
                    '    - text: Home',
                    '      internal: /index.html',
                    '',
                ]
            )
        )

        result = run_tada('dev', cwd=str(site))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'
        assert 'Welcome to CS 101: Intro' in (site / 'dist' / 'index.html').read_text()

    def test_dev_build_accepts_site_dev_json(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        rewrite_config_variant(site, SITE_DEV_CONFIG_FILE, 'site.dev.json')

        result = run_tada('dev', cwd=str(site))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'

    def test_dev_build_accepts_site_dev_yml(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        rewrite_config_variant(site, SITE_DEV_CONFIG_FILE, 'site.dev.yml')

        result = run_tada('dev', cwd=str(site))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'

    def test_prod_build_accepts_site_prod_json(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        rewrite_config_variant(site, SITE_PROD_CONFIG_FILE, 'site.prod.json')

        result = run_tada('prod', cwd=str(site))

        assert result.returncode == 0, f'prod build failed: {result.stderr}'

    def test_dev_build_accepts_nav_json(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        rewrite_config_variant(site, NAV_CONFIG_FILE, 'nav.json')

        result = run_tada('dev', cwd=str(site))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'

    def test_dev_build_accepts_authors_yml(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        (site / 'public' / 'avatar.png').write_bytes(b'avatar')
        (site / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: alex\n---\n\nHello world.\n'
        )
        write_structured_file(
            site / AUTHORS_CONFIG_FILE, {'alex': {'name': 'Alex', 'avatar': '/avatar.png'}}
        )
        rewrite_config_variant(site, AUTHORS_CONFIG_FILE, 'authors.yml')

        result = run_tada('dev', cwd=str(site))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'
        assert 'Alex' in (site / 'dist' / 'index.html').read_text()


class TestConfigFileErrors:
    def test_comment_only_site_dev_yaml_fails_validation(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        (site / SITE_DEV_CONFIG_FILE).write_text('# no config values here\n')

        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert f'{SITE_DEV_CONFIG_FILE} failed validation' in output
        assert '/: must be object' in output
        assert 'null is not an object' not in output

    def test_empty_site_prod_json_fails_validation(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        rewrite_config_variant(site, SITE_PROD_CONFIG_FILE, 'site.prod.json')
        (site / 'site.prod.json').write_text('\n')

        result = run_tada('prod', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert 'site.prod.json failed validation' in output
        assert '/: must be object' in output
        assert 'null is not an object' not in output

    def test_duplicate_site_dev_variants_fail(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        write_structured_file(
            site / 'site.dev.json', load_structured_file(site / SITE_DEV_CONFIG_FILE)
        )

        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert 'Multiple config files found for site.dev' in output

    def test_duplicate_nav_variants_fail(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        write_structured_file(site / 'nav.json', load_structured_file(site / NAV_CONFIG_FILE))

        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert 'Multiple config files found for nav' in output

    def test_missing_required_nav_config_fails(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        (site / NAV_CONFIG_FILE).unlink()

        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr

        assert result.returncode != 0
        assert 'Missing required config file for nav' in output
        assert 'nav.yaml, nav.yml, or nav.json' in output
