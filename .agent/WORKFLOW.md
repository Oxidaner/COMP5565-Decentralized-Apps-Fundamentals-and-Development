# Agent Workflow

1. Identify the requested AC IDs in `docs/acceptance.md` and the owning stream in `docs/team.md`. Check whether `docs/proposal.md` has a confirmed architecture; otherwise keep architecture-specific work reversible and state the assumption.
2. For a behavior change, update the implementation and the corresponding acceptance tests in the same PR. Contract tests cover authorization, transitions, time and claim limits; UI tests cover user-visible flows. Record manual evidence when an automated test cannot observe the criterion.
3. Run `python3 scripts/check_workspace.py` and the CI commands for every code directory touched. Check the diff for unrelated files and redundant configuration.
4. In the handoff, list AC IDs, actual commands/results, remaining manual checks, and any decision the five-person team still needs to make. A green documentation check is not a completed dApp.

For a changed third-party dependency setting, inspect the exact installed version's default first and remove settings that merely repeat it.
