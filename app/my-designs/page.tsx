import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticMyDesignsMarkup() {
  const html = readFileSync(join(process.cwd(), "my-designs.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(/<script\s+src="my-designs\.js"><\/script>/i, "").trim();
}

export default function MyDesignsPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getStaticMyDesignsMarkup() }} />
      <script src="/my-designs.js" defer />
    </>
  );
}
