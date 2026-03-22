# Navigation

Site navigation is defined in `nav.json` at the project root. It is an array of
sections, each with a title and a list of links.

Each link has display text and either an internal path or an external URL. Links
can be marked as disabled (rendered but not clickable).

The navigation is validated against a JSON schema at build time.
