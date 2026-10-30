import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isOwner, stravaConfig } from "@/lib/env";
import { SCOPE_STRAVA } from "@/lib/strava";

// Inicia la conexión con Strava (solo lectura de actividades), con «state» contra CSRF.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`);
  const cfg = stravaConfig();
  if (!cfg) return NextResponse.redirect(`${origin}/ajustes?error=strava_config#deporte`);

  const state = randomBytes(24).toString("base64url");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${origin}/auth/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE_STRAVA,
    state,
  });
  const res = NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
  res.cookies.set("s_oauth", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/strava",
    maxAge: 600,
  });
  return res;
}
