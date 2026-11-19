# Documentation

Design and project documentation for the white-label hotel guest platform, in the order a traditional software project produces them. All diagrams are Mermaid and render on GitHub.

**Live demo:** https://white-label-hms.onrender.com

| # | Document | What it answers |
| --- | --- | --- |
| 1 | [High-level design](01-high-level-design.md) | What the system is made of, how the parts talk, why these technologies |
| 2 | [Low-level design](02-low-level-design.md) | Modules, state machines, sequence diagrams, billing and tax engine, HTTP layer |
| 3 | [Database design and schema](03-database-design.md) | ER diagram, every table and column, integrity rules, double-booking prevention, Postgres path |
| 4 | [Deployment and DevOps](04-deployment-devops.md) | Environments, Docker, Render, CI/CD, configuration reference, backup and rollback |
| 5 | [Requirements](05-requirements.md) | Scope, users, user stories with acceptance criteria, business rules, non-functional requirements |
| 6 | [API specification](06-api-specification.md) | Every endpoint with request and response examples and error codes |
| 7 | [UI/UX design](07-ui-ux-design.md) | Site map, screens, visual language, theming, interaction patterns, accessibility |
| 8 | [Security and privacy](08-security-privacy.md) | Threats, identity without accounts, personal data, payments, controls, gaps |
| 9 | [Performance and scalability](09-performance-scalability.md) | Targets, current limits, scaling path |
| 10 | [Testing and test report](10-testing.md) | Strategy, test catalogue, automated and live results |
| 11 | [Architecture decision records](11-decision-records.md) | The ten key decisions and their trade-offs |
| 12 | [Runbook](12-runbook.md) | Demo preparation, everyday tasks, troubleshooting, logs |
| 13 | [Limitations and future scope](13-limitations-future-scope.md) | What the MVP doesn't do yet and the phased roadmap |
| 14 | [User guide](14-user-guide.md) | Guest guide with screenshots, 5-minute demo script, operator guide, FAQ |

**Reading paths**
- *Reviewer with 10 minutes:* user guide (demo script) → HLD → ADRs → limitations.
- *Engineer joining the project:* HLD → LLD → database → API → runbook.
- *Operator:* user guide (operator section) → runbook → deployment.
