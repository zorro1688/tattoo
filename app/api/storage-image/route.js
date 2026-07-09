import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession } from "../../../quota-store.mjs";
import { fetchOwnedStorageImage } from "../../../supabase-store.mjs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  const storagePath = searchParams.get("path");

  const image = await fetchOwnedStorageImage(session.ownerId, storagePath);

  if (!image?.ok) {
    return NextResponse.json({ error: "Image was not found." }, { status: 404, headers });
  }

  return new NextResponse(image.body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=300"
    }
  });
}
