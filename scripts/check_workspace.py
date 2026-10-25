"""Check links in the planning workspace without third-party dependencies."""

from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")


def main() -> int:
    failures = []
    documents = [ROOT / "README.md", ROOT / "AGENTS.md"]
    documents += sorted((ROOT / "docs").glob("*.md"))
    documents += sorted((ROOT / ".agent").glob("*.md"))

    for document in documents:
        for raw_target in LINK.findall(document.read_text(encoding="utf-8")):
            url = urlsplit(raw_target.strip("<>"))
            if url.scheme or url.netloc or not url.path:
                continue
            target = (document.parent / unquote(url.path)).resolve()
            if not target.is_file():
                failures.append(f"{document.relative_to(ROOT)}: missing {raw_target}")

    for code_dir in (ROOT / "packages/contracts", ROOT / "apps/web"):
        if code_dir.exists() and not (code_dir / "package.json").is_file():
            failures.append(f"{code_dir.relative_to(ROOT)}: missing package.json")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"Workspace links OK ({len(documents)} documents).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
