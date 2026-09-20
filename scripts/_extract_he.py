import re
import pathlib

root = pathlib.Path(r"e:/Projects/Reminder/client/src")
he = re.compile(r"[\u0590-\u05FF][^\"'`<>{}]{0,80}[\u0590-\u05FF]|[\u0590-\u05FF]+")

for folder in ("views", "components"):
    for p in sorted((root / folder).rglob("*.vue")):
        if "old" in p.parts:
            continue
        text = p.read_text(encoding="utf-8")
        tmpl = text.split("<script")[0]
        found: list[str] = []
        for m in he.finditer(tmpl):
            s = re.sub(r"\s+", " ", m.group()).strip()
            if len(s) >= 2 and s not in found:
                found.append(s)
        if found:
            print(f"=== {p.relative_to(root)} ({len(found)}) ===")
            for s in found[:60]:
                print(" ", s[:140])
            if len(found) > 60:
                print("  ...", len(found) - 60, "more")
            print()
