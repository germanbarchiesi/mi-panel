import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { descifrar } from "@/lib/cripto";
import { olvidarToken } from "@/lib/google";

// Solo POST. Revoca el permiso en Google (si se puede) y borra el token guardado.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`, { status: 303 });

  const { data } = await supabase
    .from("conexiones_google")
    .select("refresh_token_cifrado")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data) {
    try {
      const token = descifrar(data.refresh_token_cifrado, user.id);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Si la revocación falla, igualmente se borra el token guardado.
    }
  }

  await supabase.from("conexiones_google").delete().eq("user_id", user.id);
  olvidarToken(user.id);
  return NextResponse.redirect(`${origin}/ajustes?ok=desconectado`, { status: 303 });
}
