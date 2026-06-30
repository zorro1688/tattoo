import { NextResponse } from "next/server";
import { signOutCookie } from "../../../../auth-core.mjs";

export async function POST() {
  return NextResponse.json(
    { authenticated: false },
    {
      status: 200,
      headers: {
        "Set-Cookie": signOutCookie()
      }
    }
  );
}
