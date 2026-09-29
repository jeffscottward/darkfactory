# Support

DarkFactory is maintained as an open source repository. Support is provided on a best-effort basis; there is no guaranteed response time, resolution time, operational support, or service-level agreement.

## Start with the documentation

- [README](README.md) for the project overview and quickstart.
- [Getting started](docs/getting-started.md) for toolchain, environment, PostgreSQL, HTTPS and recovery steps.
- [Debugging](docs/debugging.md) for symptom-to-code lookups, logs and request ids.
- [Testing](docs/testing.md) for test layers, commands and prerequisites.
- [Architecture](ARCHITECTURE.md) and [conventions](CONVENTIONS.md) for repository boundaries.
- [Security model](docs/security.md) for trust boundaries and secret handling.

Run `bun run doctor` first. Its output identifies unmet repository and workstation prerequisites; redact values before sharing it.

## Ask for help or report a problem

Use the [issue chooser](https://github.com/jeffscottward/darkfactory/issues/new/choose) for reproducible DarkFactory bugs and scoped feature requests. Search [existing issues](https://github.com/jeffscottward/darkfactory/issues) first.

A useful support request includes:

- the DarkFactory revision;
- the command, route, or package involved;
- operating system, the output of `mise current`, and Docker or browser versions if relevant;
- minimal reproduction steps;
- expected and observed behavior; and
- redacted error output or artifact paths.

Public issues are not a private support channel. Never post secrets, credentials, session data, private certificates, personal data, raw environment dumps, or sensitive provider payloads.

## Security reports

Suspected vulnerabilities must use the private process in [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Support boundaries

Repository issues do not provide emergency response, production operations, incident response, private consulting, deployment guarantees, or support for unreviewed forks and modifications. Questions about a third-party tool or service may need to be raised with its maintainer after confirming the behavior is not caused by DarkFactory integration code.
