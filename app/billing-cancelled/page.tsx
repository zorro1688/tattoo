import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticBillingCancelledMarkup() {
  const html = readFileSync(join(process.cwd(), "billing-cancelled.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.trim();
}

export default function BillingCancelledPage() {
  return <div dangerouslySetInnerHTML={{ __html: getStaticBillingCancelledMarkup() }} />;
}
