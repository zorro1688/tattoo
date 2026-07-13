import { readFileSync } from "node:fs";
import { join } from "node:path";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "InkFirst",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  description:
    "InkFirst is an AI tattoo generator for first tattoo ideas, placement preview, linework, and artist-ready tattoo references.",
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Creator Pack", price: "9.99", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro Monthly", price: "12.99", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro Yearly", price: "69", priceCurrency: "USD" }
  ]
};

function getStaticHomepageMarkup() {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body
    .replace(/\s*<script\s+src="generation-state\.js"><\/script>/i, "")
    .replace(/<script\s+src="script\.js"><\/script>/i, "")
    .trim();
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div dangerouslySetInnerHTML={{ __html: getStaticHomepageMarkup() }} />
      <script src="/generation-state.js" defer />
      <script src="/script.js" defer />
    </>
  );
}
