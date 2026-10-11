#!/usr/bin/env python3
"""Reproducible non-authoritative MTS Russian reader HTML/PDF preview + page QA.

This script never edits scientific source or generated Markdown. No remote content is
fetched while producing the PDF. Intended only for proposed Draft review artifacts.
"""
import argparse
import html
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

from pypdf import PdfReader
from weasyprint import HTML, default_url_fetcher

REQUIRED = (
    "ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА",
    "Метатеория Связей",
    "FORMAL",
    "ExactSequence",
    "NO_MATCH",
    "FRM-07",
    "ACCEPT_MTS_V0_15",
)
CHAPTER_PATTERN = re.compile(r"^## ([1-9]|10)\. ", re.M)
PROVENANCE_PATTERN = re.compile(r"^\| \d+ \| ", re.M)
IMAGE_PATTERN = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")
R40_PATTERN = re.compile(r"^### R40-(?:06|07|09|10|11|12|13|14|15) ", re.M)


def safe_url_fetcher(url: str, repo_root: Path):
    parsed = urlsplit(url)
    if parsed.scheme != "file":
        raise ValueError("Remote resource not allowed in source-preserving reader: " + url)
    path = Path(unquote(parsed.path)).resolve()
    if not path.is_relative_to(repo_root.resolve()):
        raise ValueError("Resource outside checked-out repository: " + str(path))
    return default_url_fetcher(url)


def validate_markdown(md: str):
    checks = {
        "ten_numbered_chapters": len(CHAPTER_PATTERN.findall(md)) == 10,
        "119_source_registry_rows": len(PROVENANCE_PATTERN.findall(md)) == 119,
        "nine_open_R40_cases": len(R40_PATTERN.findall(md)) == 9,
        "publication_blocked": "ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА" in md,
        "no_author_approval_statement": "ПУБЛИКАЦИЯ РАЗРЕШЕНА" not in md,
        "contains_required_theory_terms": all(s in md for s in REQUIRED),
    }
    if not all(checks.values()):
        raise ValueError("Source preview assertions failed: " + str(checks))
    return checks


def html_from_markdown(markdown_path: Path, stylesheet: str):
    proc = subprocess.run([
        "pandoc", str(markdown_path), "--from=gfm+tex_math_dollars",
        "--to=html5", "--standalone", "--toc", "--toc-depth=2",
        "--metadata=lang:ru", "--metadata=title:Метатеория Связей — научный черновик v0.15",
        "--mathml", "--wrap=none",
    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8")
    rendered = proc.stdout
    if "</head>" not in rendered:
        raise ValueError("Pandoc did not provide a complete HTML document")
    # Pandoc's metadata title and generated h1 otherwise produce duplicate title pages.
    rendered, title_blocks = re.subn(
        r'<header id="title-block-header">[\s\S]*?</header>\s*', "", rendered, count=1
    )
    if title_blocks != 1:
        raise ValueError("Expected exactly one Pandoc metadata title block")
    toc = re.search(r'<nav id="TOC"[\s\S]*?</nav>', rendered)
    if toc is None:
        raise ValueError("Pandoc generated no navigable contents list")
    rendered = rendered.replace(toc.group(0), "", 1)
    cover = re.search(
        r'<h1 id="[^"]+">[\s\S]*?</h1>\s*'
        r'<p><strong>ПРЕДЛОЖЕНИЕ[\s\S]*?</strong></p>',
        rendered,
    )
    if cover is None:
        raise ValueError("Cannot locate unchanged blocked-publication cover")
    rendered = rendered[:cover.end()] + "\n" + toc.group(0) + rendered[cover.end():]
    # Ten numbered chapters and five substantial appendices start new pages; short E follows D.
    rendered, chapter_breaks = re.subn(
        r'<h2 id="((?:[1-9]|10)-[^"]+|приложение-[абвгд]-[^"]+)">',
        r'<h2 class="chapter-break" id="\1">',
        rendered,
    )
    if chapter_breaks != 15:
        raise ValueError("Expected ten chapters and five long appendix page starts; short E follows D")
    # Keep a small AND truth table intact, but allow the 119-row register to paginate.
    compact_tables = 0
    def mark_compact(match):
        nonlocal compact_tables
        table = match.group(0)
        if table.count("<tr") <= 8:
            compact_tables += 1
            return table.replace("<table>", '<table class="compact-table">', 1)
        return table
    rendered = re.sub(r"<table>[\s\S]*?</table>", mark_compact, rendered)
    if compact_tables != 1:
        raise ValueError("Expected exactly one compact five-row AND example table")
    rendered = rendered.replace("</head>", "<style>\n" + stylesheet + "\n</style>\n</head>", 1)
    return rendered


def verify_html_refs(rendered: str):
    # All pandoc-generated internal references must have destinations.
    ids = set(re.findall(r'\bid="([^"]+)"', rendered))
    targets = set(re.findall(r'href="#([^"]+)"', rendered))
    missing = sorted(unquote(x) for x in targets if x not in ids)
    if missing:
        raise ValueError("Broken internal HTML links: " + ", ".join(missing[:8]))
    return {"toc_targets": len(targets), "known_anchors": len(ids), "unresolved": 0}


def page_thumbnails(pdf_path: Path, dest: Path):
    try:
        import fitz
        from PIL import Image, ImageDraw
    except ImportError:
        return {"generated": False, "reason": "PyMuPDF/Pillow unavailable"}
    dest.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    sheets = []
    for first in range(0, len(doc), 12):
        page_images = []
        for n in range(first, min(first + 12, len(doc))):
            pix = doc[n].get_pixmap(matrix=fitz.Matrix(0.67, 0.67), alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            page_images.append((n + 1, img))
        tile_w = max(x.width for _, x in page_images) + 16
        tile_h = max(x.height for _, x in page_images) + 32
        sheet = Image.new("RGB", (tile_w * 3, tile_h * 4), "white")
        draw = ImageDraw.Draw(sheet)
        for i, (number, im) in enumerate(page_images):
            x = (i % 3) * tile_w + 8
            y = (i // 3) * tile_h + 22
            sheet.paste(im, (x, y))
            draw.text((x, y - 16), "page " + str(number), fill="black")
        out = dest / ("contact-%03d-%03d.png" % (first + 1, min(first + 12, len(doc))))
        sheet.save(out, optimize=True)
        sheets.append(out.name)
    for n, name in [(0, "page-first.png"), (len(doc) - 1, "page-last.png")]:
        if n >= 0:
            pix = doc[n].get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
            pix.save(dest / name)
    return {"generated": True, "sheets": sheets, "first_last": 2}


def verify_pdf(path: Path):
    doc = PdfReader(str(path))
    texts = [(p.extract_text() or "") for p in doc.pages]
    joined = "\n".join(texts)
    print_chars = len(joined.strip())
    pdf_links = sum(len(p.get("/Annots", [])) for p in doc.pages)
    missing_required = [term for term in REQUIRED if term not in joined]
    replacement_chars = joined.count("\ufffd")
    blank_pages = [i + 1 for i, text in enumerate(texts) if len(text.strip()) < 30]
    dimensions = sorted(set((round(float(p.mediabox.width)), round(float(p.mediabox.height))) for p in doc.pages))
    cyrillic = len(re.findall("[А-Яа-яЁё]", joined))
    example_pages = [i + 1 for i, t in enumerate(texts)
                     if "Пример на принятых источниках" in t]
    table_pages = [i + 1 for i, t in enumerate(texts)
                   if "RuleFF" in t and "RuleTT" in t]
    checks = {
        "first_page_contains_title": "Метатеория Связей:" in texts[0],
        "and_example_and_truth_table_same_page": example_pages == table_pages and len(example_pages) == 1,
        "required_math_glyphs_present": all(x in joined for x in ("⟼", "Γ", "∞", "♂", "♀", "₀", "₁")),
        "page_count": len(doc.pages), "extracted_chars": print_chars,
        "cyrillic_chars": cyrillic, "pdf_links": pdf_links,
        "blank_or_near_blank_pages": blank_pages,
        "required_text_missing": missing_required,
        "replacement_characters": replacement_chars,
        "page_sizes_points": dimensions,
    }
    if not (len(doc.pages) >= 10 and print_chars >= 55000 and cyrillic >= 20000):
        raise ValueError("PDF extraction/length sanity failed: " + json.dumps(checks, ensure_ascii=False))
    if missing_required or replacement_chars:
        raise ValueError("Unicode/source-content loss: " + json.dumps(checks, ensure_ascii=False))
    if not (checks["first_page_contains_title"] and
            checks["and_example_and_truth_table_same_page"] and
            checks["required_math_glyphs_present"]):
        raise ValueError("Visual/mathematical layout regression: " + json.dumps(checks, ensure_ascii=False))
    if dimensions != [(595, 842)]:
        raise ValueError("Non-A4 PDF page geometry: " + str(dimensions))
    return checks


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--css", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--thumbnails", action="store_true")
    args = parser.parse_args()
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    src = args.input.resolve()
    repo_root = args.repo_root.resolve()
    if not src.exists() or not args.css.exists():
        raise FileNotFoundError("Both Markdown and CSS templates must exist")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        raise ValueError("Exact Git SHA required, no moving branch alias")
    md = src.read_text(encoding="utf-8")
    checks = validate_markdown(md)
    stylesheet = args.css.read_text(encoding="utf-8")
    result_html = html_from_markdown(src, stylesheet)
    links = verify_html_refs(result_html)
    html_path = out / "mts-v015-reader-preview.html"
    pdf_path = out / "mts-v015-reader-preview.pdf"
    markdown_copy = out / "mts-v015-reader-preview.md"
    html_path.write_text(result_html, encoding="utf-8")
    shutil.copyfile(src, markdown_copy)
    url_fetcher = lambda url: safe_url_fetcher(url, repo_root)
    HTML(string=result_html, base_url=repo_root.as_uri() + "/", url_fetcher=url_fetcher).write_pdf(pdf_path)
    pdf_checks = verify_pdf(pdf_path)
    thumbnails = page_thumbnails(pdf_path, out / "contact-sheets") if args.thumbnails else {"generated": False}
    images = IMAGE_PATTERN.findall(md)
    report = {
        "status": "GENERATED_PREVIEW_NOT_AUTHOR_ACCEPTED",
        "source_commit": args.source_sha,
        "source_filename": src.name,
        "checks": checks,
        "html": links,
        "pdf": pdf_checks,
        "images": {
            "markdown_references": len(images),
            "historical_placement": "NOT_VERIFIED_IF_NO_EXPLICIT_SOURCE_REFERENCES",
            "warning": "Historical repository imagery is not removed or automatically assigned a scientific meaning.",
        },
        "thumbnails": thumbnails,
    }
    (out / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
