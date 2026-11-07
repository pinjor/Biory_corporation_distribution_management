import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parents[2]
src = root / "src/integrations/supabase/types.ts"
dst = root / "src/lib/database.types.ts"
if src.exists():
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(src, dst)
    print("moved types")
elif not dst.exists():
    raise SystemExit("types missing")

replacements = {
    'from "@/integrations/supabase/client"': 'from "@/lib/api/client"',
    "from '@/integrations/supabase/client'": "from '@/lib/api/client'",
    'from "@/integrations/supabase/types"': 'from "@/lib/database.types"',
    "from '@/integrations/supabase/types'": "from '@/lib/database.types'",
}
count = 0
for path in (root / "src").rglob("*"):
    if path.suffix not in {".ts", ".tsx"} or not path.is_file():
        continue
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in replacements.items():
        text = text.replace(old, new)
    if 'from "@/lib/api/client"' in text or "from '@/lib/api/client'" in text:
        text = text.replace("import { supabase }", "import { api }")
        text = text.replace("supabase.", "api.")
    if text != orig:
        path.write_text(text, encoding="utf-8", newline="\n")
        count += 1
        print(path.relative_to(root))
print("updated", count)
