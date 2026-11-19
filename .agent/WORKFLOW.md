# Agent Workflow

1. Identify the requested AC IDs in `docs/acceptance.md` and the owning stream in `docs/team.md`. The confirmed architecture is Hardhat/Solidity + React/Vite, with local course demos and Sepolia/GitHub Pages for online collaboration. For publication or network changes, read `docs/deployment.md`; if a decision changes, update `docs/proposal.md` and `docs/acceptance.md` before changing code.
2. For a behavior change, update the implementation and the corresponding acceptance tests in the same PR. Contract tests cover authorization, transitions, timeout, warranty time and claim limits; UI tests cover public verification and the four role workbench paths. Record manual evidence when an automated test cannot observe the criterion.
3. Run the repository checks and the CI commands for every code directory touched:
   - `python3 scripts/check_workspace.py`
   - `npm --prefix packages/contracts ci && npm --prefix packages/contracts run compile && npm --prefix packages/contracts run test:acceptance`
   - `npm --prefix apps/web ci && npm --prefix apps/web run lint && npm --prefix apps/web run test:acceptance && npm --prefix apps/web run build`
4. Keep generated dependencies, Hardhat artifacts/cache, the generated `apps/web/public/ProductWarranty.json`, local `.env` files, and test wallets out of commits. The web build exports its deployment artifact from compiled source. The final source ZIP must pass `python3 scripts/check_submission.py --group <number>`.
5. In the handoff, list AC IDs, actual commands/results, remaining manual checks, and any decision the five-person team still needs to make. Green CI proves the automated portion only; it does not replace wallet interaction, accessibility review, report layout, or the timed presentation.

For a changed third-party dependency setting, inspect the exact installed version's default first and remove settings that merely repeat it.
