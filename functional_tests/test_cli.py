import re


class TestVersion:
    def test_version_flag(self, tada):
        result = tada("--version")
        assert result.returncode == 0
        assert re.match(r"tada v\d+\.\d+\.\d+", result.stdout.strip())

    def test_version_short_flag(self, tada):
        result = tada("-v")
        assert result.returncode == 0
        assert result.stdout.strip().startswith("tada v")


class TestHelp:
    def test_help_flag(self, tada):
        result = tada("--help")
        assert result.returncode == 0
        assert "Usage: tada <command>" in result.stdout

    def test_help_short_flag(self, tada):
        result = tada("-h")
        assert result.returncode == 0
        assert "Usage: tada <command>" in result.stdout

    def test_no_args_shows_usage(self, tada):
        result = tada()
        assert result.returncode == 0
        assert "Usage: tada <command>" in result.stdout

    def test_help_lists_commands(self, tada):
        result = tada("--help")
        for cmd in ["init", "dev", "prod", "watch", "serve", "clean"]:
            assert cmd in result.stdout


class TestUnknownCommand:
    def test_unknown_command_exits_1(self, tada):
        result = tada("notacommand")
        assert result.returncode == 1
