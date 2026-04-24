import re

from conftest import run_tada


class TestVersion:
    def test_version_flag(self):
        result = run_tada('--version')
        assert result.returncode == 0
        assert re.match(r'tada v\d+\.\d+\.\d+', result.stdout.strip())

    def test_version_short_flag(self):
        result = run_tada('-v')
        assert result.returncode == 0
        assert result.stdout.strip().startswith('tada v')


class TestHelp:
    def test_help_flag(self):
        result = run_tada('--help')
        assert result.returncode == 0
        assert 'Usage: tada <command>' in result.stdout

    def test_help_short_flag(self):
        result = run_tada('-h')
        assert result.returncode == 0
        assert 'Usage: tada <command>' in result.stdout

    def test_no_args_shows_usage(self):
        result = run_tada()
        assert result.returncode == 0
        assert 'Usage: tada <command>' in result.stdout

    def test_help_lists_commands(self):
        result = run_tada('--help')
        for cmd in ['init', 'dev', 'prod', 'watch', 'serve', 'clean']:
            assert cmd in result.stdout


class TestUnknownCommand:
    def test_unknown_command_exits_1(self):
        result = run_tada('notacommand')
        assert result.returncode == 1
