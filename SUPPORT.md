# Support

DarkFactory is maintained as an open source repository. Support is provided on a best-effort basis; there is no guaranteed response time, resolution time, operational support, or service-level agreement.

## Start with the documentation

- [README](README.md) for the project overview and quick start.
- [Local development](docs/local-development.md) for toolchain, environment, PostgreSQL, HTTPS, and recovery steps.
- [Testing and evidence](docs/testing-and-evidence.md) for verification commands and prerequisites.
- [Architecture](ARCHITECTURE.md) and [conventions](CONVENTIONS.md) for repository boundaries.
- [Security guidance](docs/security.md) for development trust boundaries.

Run `varlock run -- bun run doctor` after the documented local prerequisites are ready. Its output identifies unmet repository and workstation prerequisites; redact values before sharing it.

## Ask for help or report a problem

Use the [issue chooser](https://github.com/jeffscottward/darkfactory/issues/new/choose) for reproducible DarkFactory bugs and scoped feature requests. Search [existing issues](https://github.com/jeffscottward/darkfactory/issues) first.

A useful support request includes:

- the DarkFactory revision;
- the command, route, or package involved;
- operating system and relevant Bun, Node.js, pnpm, Docker, or browser versions;
- minimal reproduction steps;
- expected and observed behavior; and
- redacted error output or artifact paths.

Public issues are not a private support channel. Never post secrets, credentials, session data, private certificates, personal data, raw environment dumps, or sensitive provider payloads.

## Security reports

Suspected vulnerabilities must use the private process in [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Support boundaries

Repository issues do not provide emergency response, production operations, incident response, private consulting, deployment guarantees, or support for unreviewed forks and modifications. Questions about a third-party tool or service may need to be raised with its maintainer after confirming the behavior is not caused by DarkFactory integration code.
