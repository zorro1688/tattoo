import { NextResponse } from "next/server.js";
import { parseCreemWebhook } from "../../../../billing-core.mjs";
import { isCreditGrantingEvent } from "../../../../billing-history-core.mjs";
import { addPaidCredits, recordBillingEvent } from "../../../../quota-store.mjs";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("creem-signature") || request.headers.get("x-creem-signature");
    const event = parseCreemWebhook(rawBody, signature, process.env.CREEM_WEBHOOK_SECRET);
    await recordBillingEvent(event);
    const result = isCreditGrantingEvent(event.eventType)
      ? await addPaidCredits(event.clientId, event.credits, {
          source: "creem",
          externalEventId: event.eventId,
          plan: event.plan
        })
      : null;

    return NextResponse.json({ received: true, recorded: true, granted: Boolean(result?.granted) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

