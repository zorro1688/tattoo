import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticDesignMarkup() {
  const html = readFileSync(join(process.cwd(), "design.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(/<script\s+src="design\.js"><\/script>/i, "").trim();
}

export default function DesignPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getStaticDesignMarkup() }} />
      <script src="/design.js" defer />
    </>
  );
}
