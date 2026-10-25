"""Check the course submission names and source ZIP before uploading."""

import argparse
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import zipfile


SOURCE_SUFFIXES = {
    ".sol", ".go", ".js", ".jsx", ".ts", ".tsx", ".py", ".html",
    ".java", ".kt", ".swift", ".dart",
}
EXCLUDED_PARTS = {"node_modules", ".git", "__MACOSX", ".DS_Store", "cache"}


def check_pdf(path: Path, page_limit: int | None = None) -> None:
    with path.open("rb") as stream:
        signature = stream.read(5)
    if signature != b"%PDF-":
        raise ValueError(f"{path.name}: invalid PDF signature")
    if page_limit is None:
        return
    if not shutil.which("pdfinfo"):
        raise ValueError("pdfinfo is required to check the report's 30-page limit")
    result = subprocess.run(
        ["pdfinfo", str(path)], capture_output=True, text=True, check=True
    )
    match = re.search(r"^Pages:\s+(\d+)$", result.stdout, re.MULTILINE)
    if not match or int(match.group(1)) > page_limit:
        raise ValueError(f"{path.name}: report must have at most {page_limit} pages")


def check_zip(path: Path) -> None:
    if not zipfile.is_zipfile(path):
        raise ValueError(f"{path.name}: invalid ZIP")
    with zipfile.ZipFile(path) as archive:
        names = [PurePosixPath(info.filename) for info in archive.infolist()]
        files = [
            PurePosixPath(info.filename)
            for info in archive.infolist()
            if not info.is_dir()
        ]
        if not files:
            raise ValueError(f"{path.name}: empty source folder")
        roots = {name.parts[0] for name in files}
        if len(roots) != 1 or any(len(name.parts) < 2 for name in files):
            raise ValueError(f"{path.name}: source must be inside one root folder")
        for name in names:
            if (
                name.is_absolute()
                or ".." in name.parts
                or any(part in EXCLUDED_PARTS for part in name.parts)
                or any(part == ".env" or part.startswith(".env.") for part in name.parts)
            ):
                raise ValueError(f"{path.name}: unsafe or generated entry {name}")
        if not any(name.suffix.lower() in SOURCE_SUFFIXES for name in files):
            raise ValueError(f"{path.name}: no recognizable source code")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", required=True, type=int, help="Positive group number")
    parser.add_argument("--dir", type=Path, default=Path("submission"))
    args = parser.parse_args()
    if args.group <= 0:
        parser.error("--group must be positive")

    root = args.dir
    prefix = f"Group{args.group}"
    report = root / f"{prefix}-report.pdf"
    slides = [root / f"{prefix}-slides.{suffix}" for suffix in ("pdf", "pptx")]
    source = root / f"{prefix}.zip"
    required = [report, source]
    if not any(path.is_file() for path in slides):
        required.append(slides[0])
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        print(f"Missing: {', '.join(missing)}", file=sys.stderr)
        return 1

    try:
        check_pdf(report, page_limit=30)
        for slide in slides:
            if slide.is_file():
                if slide.suffix == ".pdf":
                    check_pdf(slide)
                else:
                    if not zipfile.is_zipfile(slide):
                        raise ValueError(f"{slide.name}: invalid PPTX")
                    with zipfile.ZipFile(slide) as archive:
                        if "ppt/presentation.xml" not in archive.namelist():
                            raise ValueError(f"{slide.name}: missing presentation data")
        check_zip(source)
    except (ValueError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        return 1
    print(f"{prefix}: filenames, PDF page limit and source ZIP OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
