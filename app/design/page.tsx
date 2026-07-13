import { readFileSync } from "node:fs";
import { join } from "node:path";

function getStaticDesignMarkup() {
  const html = readFileSync(join(process.cwd(), "design.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body
    .replace(/\s*<script\s+src="generation-state\.js"><\/script>/i, "")
    .replace(/<script\s+src="design\.js"><\/script>/i, "")
    .trim();
}

export default function DesignPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getStaticDesignMarkup() }} />
      <script src="/generation-state.js" defer />
      <script src="/design.js" defer />
    </>
  );
}
