import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.inkfirsttattoo.art"),
  title: "AI Tattoo Generator - Design Your First Tattoo Online | InkFirst",
  description:
    "Create custom tattoo ideas with InkFirst's AI tattoo generator. Choose a style, preview placement, generate linework, and download an artist-ready tattoo reference.",
  alternates: {
    canonical: "/"
  },
  verification: {
    google: "VUSzVZSCZ-fcwsZEULs577zlphOnO_RK3rm6PQPI3bg"
  },
  openGraph: {
    title: "AI Tattoo Generator - Design Your First Tattoo Online | InkFirst",
    description:
      "Create custom tattoo ideas with InkFirst's AI tattoo generator. Choose a style, preview placement, generate linework, and download an artist-ready tattoo reference.",
    type: "website",
    url: "/"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
