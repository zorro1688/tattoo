import { NextResponse } from "next/server";
import { resolveDownloadFile } from "../../../download-core.mjs";
import { createRequestId, reportError } from "../../../monitoring-core.mjs";
import { buildClientCookie, getClientSession } from "../../../quota-store.mjs";

export async function GET(request) {
  const requestId = createRequestId(request);
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const generationId = searchParams.get("generationId");
  const type = searchParams.get("type");
  const headers = {
    ...(session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {}),
    "X-Request-Id": requestId
  };

  try {
    const file = await resolveDownloadFile({
      clientId: session.ownerId,
      generationId,
      type,
      selectedConceptUrl: searchParams.get("selectedConceptUrl") ?? "",
      publicBaseUrl: new URL(request.url).origin
    });

    if (file.error) {
      if (file.status >= 500) {
        await reportError({
          event: "download_resolution_failed",
          stage: "download",
          route: "/api/download",
          requestId,
          generationId,
          ownerId: session.ownerId,
          error: new Error(file.error),
          statusCode: file.status,
          durationMs: Date.now() - startedAt,
          retryable: true
        });
      }
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
  } catch (error) {
    await reportError({
      event: "download_resolution_failed",
      stage: "download",
      route: "/api/download",
      requestId,
      generationId,
      ownerId: session.ownerId,
      error,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      retryable: true
    });
    return NextResponse.json(
      { error: error.message ?? `Could not prepare ${type || "image"} download.` },
      { status: 500, headers }
    );
  }
}
