import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = path.join(root, "src/integrations/supabase/types.ts");
const dst = path.join(root, "src/lib/database.types.ts");
if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
  console.log("moved types");
} else if (!fs.existsSync(dst)) {
  throw new Error("types missing");
}

const replacements = [
  ['from "@/integrations/supabase/client"', 'from "@/lib/api/client"'],
  ["from '@/integrations/supabase/client'", "from '@/lib/api/client'"],
  ['from "@/integrations/supabase/types"', 'from "@/lib/database.types"'],
  ["from '@/integrations/supabase/types'", "from '@/lib/database.types'"],
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

let count = 0;
for (const file of walk(path.join(root, "src"))) {
  let text = fs.readFileSync(file, "utf8");
  const orig = text;
  for (const [oldValue, newValue] of replacements) text = text.replaceAll(oldValue, newValue);
  if (text.includes('from "@/lib/api/client"') || text.includes("from '@/lib/api/client'")) {
    text = text.replaceAll("import { supabase }", "import { api }");
    text = text.replaceAll("supabase.", "api.");
  }
  if (text !== orig) {
    fs.writeFileSync(file, text.replaceAll("\r\n", "\n"), "utf8");
    count += 1;
    console.log(path.relative(root, file));
  }
}
console.log("updated", count);
