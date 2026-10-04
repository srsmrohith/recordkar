import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Supabase verifies the emailed link, then redirects here with
 * ?code=… (PKCE). Exchanging it sets the session cookies; the user lands signed in on /.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const loginWithError = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  if (searchParams.get("error")) {
    return loginWithError(searchParams.get("error_code") === "otp_expired" ? "expired" : "link");
  }
  if (!code) return loginWithError("link");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // Most common cause: the link was opened in a different browser than the one that requested it.
  if (error) return loginWithError("link");

  return NextResponse.redirect(new URL("/", origin));
}
