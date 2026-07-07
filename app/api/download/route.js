import { NextResponse } from "next/server";
import { resolveDownloadFile } from "../../../download-core.mjs";
import { buildClientCookie, getClientSession } from "../../../quota-store.mjs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  const file = await resolveDownloadFile({
    clientId: session.ownerId,
    generationId: searchParams.get("generationId"),
    type: searchParams.get("type"),
    publicBaseUrl: new URL(request.url).origin
  });

  if (file.error) {
    return NextResponse.json({ error: file.error }, { status: file.status, headers });
  }

  return new NextResponse(file.body, {
    status: file.status,
    headers: {
      ...headers,
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
