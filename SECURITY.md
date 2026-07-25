# Security Policy

## Supported versions

DarkFactory security fixes target the latest published release and the current default branch. Historical releases and commits, forks, modified copies, and downstream deployments are not covered by a guaranteed support schedule.

## Report a vulnerability privately

Do not disclose suspected vulnerabilities, exploit details, credentials, or sensitive evidence in a public issue, discussion, or pull request.

Submit a private report through [GitHub private vulnerability reporting](https://github.com/jeffscottward/darkfactory/security/advisories/new). Include only the information needed to understand and reproduce the issue safely:

- the affected component and revision;
- prerequisites and a minimal reproduction;
- observed and expected behavior;
- the potential impact and affected boundary;
- any suggested remediation; and
- redacted logs or evidence, when useful.

Never include live credentials, private keys, session cookies, personal data, or data obtained from a system you were not authorized to test. If a report concerns a third-party dependency or service rather than DarkFactory code, follow that project's reporting policy as well.

## Scope and safe research

A public repository does not authorize testing of production, shared, third-party, or otherwise unidentified systems. Test only systems and data you own or have explicit permission to assess. Avoid privacy violations, service disruption, destructive actions, persistence, social engineering, and access beyond the minimum needed to demonstrate the issue.

The private advisory is for vulnerabilities in this repository. General bugs, feature requests, and usage questions belong in the repository's public issue forms or the channels described in [SUPPORT.md](SUPPORT.md).

## Response and assurance

A private report may be reviewed, discussed, remediated, or declined through the advisory when a maintainer is available. Submission does not guarantee acknowledgement, a response or remediation time, acceptance of a severity assessment, a disclosure date, or any other service-level agreement.

This policy and the repository do not constitute a security certification, penetration-test result, compliance assessment, warranty, or security attestation. For development trust boundaries and verification guidance, see [docs/security.md](docs/security.md).
