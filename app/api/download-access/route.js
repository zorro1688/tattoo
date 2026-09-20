import { NextResponse } from "next/server";
import { getPlan } from "../../../billing-core.mjs";
import {
  buildClientCookie,
  getBillingHistory,
  getClientSession,
  getDownloadAccess
} from "../../../quota-store.mjs";

export async function GET(request) {
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  const downloadAccess = await getDownloadAccess(session.ownerId);
  let purchase = null;

  if (session.isAuthenticated && request.nextUrl.searchParams.get("includePurchase") === "1") {
    const requestedPlan = request.nextUrl.searchParams.get("plan") ?? "";
    const history = await getBillingHistory(session.ownerId, { limit: 50 });
    const paidEvent = history.events.find(
      (event) => event.status === "paid" && (!requestedPlan || event.plan === requestedPlan)
    );

    if (paidEvent) {
      const plan = getPlan(paidEvent.plan);
      purchase = {
        transactionId: paidEvent.id,
        plan: plan.id,
        itemName: plan.name,
        value: plan.price,
        currency: plan.currency,
        confirmedAt: paidEvent.occurredAt
      };
    }
  }

  return NextResponse.json({ downloadAccess, purchase }, { status: 200, headers });
}
