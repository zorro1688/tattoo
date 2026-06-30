import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticSuccessMarkup() {
  const html = readFileSync(join(process.cwd(), "success.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(/<script\s+src="success\.js"><\/script>/i, "").trim();
}

export default function SuccessPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getStaticSuccessMarkup() }} />
      <script src="/success.js" defer />
    </>
  );
}
