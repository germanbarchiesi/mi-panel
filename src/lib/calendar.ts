import type { Evento } from "@/lib/agenda";
import { GoogleReconectar } from "@/lib/google";

const API = "https://www.googleapis.com/calendar/v3";

export type CalendarioInfo = {
  id: string;
  nombre: string;
  color?: string;
  principal: boolean;
  seleccionadoEnGoogle: boolean;
};

async function gget<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new GoogleReconectar("revocado");
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  return (await res.json()) as T;
}

export async function listarCalendarios(token: string): Promise<CalendarioInfo[]> {
  type Resp = {
    items?: {
      id: string;
      summary?: string;
      summaryOverride?: string;
      backgroundColor?: string;
      primary?: boolean;
      selected?: boolean;
    }[];
  };
  const r = await gget<Resp>(token, "/users/me/calendarList", {
    minAccessRole: "reader",
    fields: "items(id,summary,summaryOverride,backgroundColor,primary,selected)",
  });
  return (r.items ?? []).map((c) => ({
    id: c.id,
    nombre: c.summaryOverride ?? c.summary ?? c.id,
    color: c.backgroundColor,
    principal: c.primary === true,
    seleccionadoEnGoogle: c.selected === true,
  }));
}

/** Calendarios que el panel no lee por defecto: «Mis tareas» (se leen por su API) y «Deporte» (fase 7). */
export function excluidoPorDefecto(nombre: string): boolean {
  return /^(mis tareas|deporte)$/i.test(nombre.trim());
}

type GEvento = {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  transparency?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

export async function listarEventos(
  token: string,
  cal: CalendarioInfo,
  desdeMs: number,
  hastaMs: number,
): Promise<Evento[]> {
  const r = await gget<{ items?: GEvento[] }>(token, `/calendars/${encodeURIComponent(cal.id)}/events`, {
    timeMin: new Date(desdeMs).toISOString(),
    timeMax: new Date(hastaMs).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields:
      "items(id,iCalUID,status,summary,location,transparency,eventType,start,end,attendees(self,responseStatus))",
  });

  const out: Evento[] = [];
  for (const e of r.items ?? []) {
    if (e.status === "cancelled") continue;
    if (e.eventType === "workingLocation") continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (!e.start || !e.end) continue;

    const base = {
      clave: `${e.iCalUID ?? e.id}|${e.start.dateTime ?? e.start.date}`,
      titulo: e.summary?.trim() || "(sin título)",
      calendario: cal.nombre,
      color: cal.color,
      libre: e.transparency === "transparent",
      lugar: e.location,
    };

    if (e.start.date && e.end.date) {
      out.push({ ...base, todoElDia: true, diaIni: e.start.date, diaFin: e.end.date });
    } else if (e.start.dateTime && e.end.dateTime) {
      out.push({ ...base, todoElDia: false, inicio: Date.parse(e.start.dateTime), fin: Date.parse(e.end.dateTime) });
    }
  }
  return out;
}
