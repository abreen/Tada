# Build Diffing

Tada can compare two production builds to show what changed. It reads the
manifests of two versions and uses file hashes to identify added, changed, and
removed files.

By default, the two most recent versions are compared. Specific version numbers
can also be provided.

## Copy mode

The `--copy <dir>` flag extracts only the changed files (added and modified)
into a separate directory for incremental deployment. The directory also
includes:

- The search index (`pagefind/`), which is excluded from manifest tracking but
  always needed
- The `tada.manifest.json` from the **more recent** of the two compared
  versions, so that after uploading the changed files (overwriting an existing
  deployment, e.g. in an S3 bucket) the manifest reflects the final state of all
  files

Removed files are listed in the diff output but not copied. The deployer is
responsible for deleting them from the target.
