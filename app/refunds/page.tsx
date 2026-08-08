import { readFileSync } from "node:fs";
import { join } from "node:path";

export default function RefundsPage() {
  const html = readFileSync(join(process.cwd(), "refunds.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return <div dangerouslySetInnerHTML={{ __html: body.trim() }} />;
}