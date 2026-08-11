import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { guideSlugs, guidesBySlug } from "../../../guide-catalog.mjs";

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guidesBySlug[slug];
  if (!guide) notFound();

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: guide.url }
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guidesBySlug[slug];
  if (!guide) notFound();

  const html = await readFile(join(process.cwd(), guide.htmlFile), "utf8");
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return <div dangerouslySetInnerHTML={{ __html: body.trim() }} />;
}
