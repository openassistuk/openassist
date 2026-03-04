# Security Policy

OpenAssist is a local-first operator tool that can execute host-impacting actions when explicitly elevated. We treat security reports as production incidents.

## Supported Versions

Until a stable versioning policy is published, the supported release line is the current `main` branch.

## Reporting a Vulnerability

- Primary channel: GitHub Private Vulnerability Reporting for this repository.
- Direct link: `https://github.com/openassistuk/openassist/security/advisories/new`
- Do not open public issues for unpatched vulnerabilities.

When reporting, include:

- affected version/commit
- exact reproduction steps
- impact assessment (confidentiality, integrity, availability)
- logs or payload samples with secrets removed

## Response Expectations

- Acknowledgement target: within 2 business days.
- Initial triage target: within 5 business days.
- Ongoing updates: at least weekly while the issue is open.
- Fix target:
  - Critical/High: as soon as possible, with priority patch flow.
  - Moderate/Low: scheduled into the next appropriate release window.

## Disclosure Policy

- Please keep reports private until maintainers confirm a fix is available.
- After remediation, maintainers may publish a coordinated advisory with impact and mitigation details.

## Scope

In scope:

- `openassistd` daemon API/runtime paths
- `openassist` CLI lifecycle/setup/service flows
- provider/channel/tool adapters and policy enforcement
- scheduler/recovery/durability logic
- installer/bootstrap scripts and CI/security workflows

Out of scope:

- social engineering and phishing not tied to a product flaw
- unsupported local environment misconfiguration without a software defect

## Security References

- Threat model: `docs/security/threat-model.md`
- Policy profiles: `docs/security/policy-profiles.md`
- Tool-calling interface/security boundaries: `docs/interfaces/tool-calling.md`
