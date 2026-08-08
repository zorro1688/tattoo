import { readFileSync } from "node:fs";
import { join } from "node:path";

export default function PrivacyPage() {
  const html = readFileSync(join(process.cwd(), "privacy.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return <div dangerouslySetInnerHTML={{ __html: body.trim() }} />;
}