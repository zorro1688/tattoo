import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticBillingMarkup() {
  const html = readFileSync(join(process.cwd(), "billing.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(/<script\s+src="billing\.js"><\/script>/i, "").trim();
}

export default function BillingPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getStaticBillingMarkup() }} />
      <script src="/billing.js" defer />
    </>
  );
}
