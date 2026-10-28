"use client";

import { useState } from "react";

// Selector de Google (Picker): el usuario elige su Excel y, con el permiso drive.file, Mi Panel
// solo puede leer ese fichero. El script de Google se carga solo al pulsar el botón.

type Picker = {
  setVisible(v: boolean): void;
};
type GooglePicker = {
  picker: {
    DocsView: new (viewId?: string) => {
      setMimeTypes(m: string): unknown;
      setIncludeFolders(b: boolean): unknown;
      setMode(m: string): unknown;
    };
    PickerBuilder: new () => {
      setAppId(id: string): GooglePickerBuilder;
    };
    ViewId: { DOCS: string };
    DocsViewMode: { LIST: string };
    Action: { PICKED: string; CANCEL: string };
  };
};
type GooglePickerBuilder = {
  setAppId(id: string): GooglePickerBuilder;
  setOAuthToken(t: string): GooglePickerBuilder;
  setDeveloperKey(k: string): GooglePickerBuilder;
  addView(v: unknown): GooglePickerBuilder;
  setOrigin(o: string): GooglePickerBuilder;
  setLocale(l: string): GooglePickerBuilder;
  setTitle(t: string): GooglePickerBuilder;
  setCallback(cb: (d: { action: string; docs?: { id: string; name: string }[] }) => void): GooglePickerBuilder;
  build(): Picker;
};
declare global {
  interface Window {
    gapi?: { load(nombre: string, cb: () => void): void };
    google?: GooglePicker;
  }
}

const MIMES = [
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

let cargando: Promise<void> | null = null;
function cargarPicker(): Promise<void> {
  cargando ??= new Promise<void>((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => window.gapi?.load("picker", () => ok());
    s.onerror = () => {
      cargando = null;
      ko(new Error("script"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

const ERRORES: Record<string, string> = {
  sin_drive: "Falta el permiso de Drive: pulsa «Reconectar Google» y acepta el acceso a los ficheros que elijas.",
  config: "Falta configurar GOOGLE_PICKER_API_KEY o GOOGLE_PROJECT_NUMBER en Vercel.",
  script: "No se pudo cargar el selector de Google.",
};

export function ElegirExcel({ guardar, texto }: { guardar: (id: string) => Promise<void>; texto: string }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch("/api/drive/selector", { method: "POST", cache: "no-store" });
      const cfg = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cfg.error ?? "google");
      await cargarPicker();
      const g = window.google;
      if (!g?.picker) throw new Error("script");
      const vista = new g.picker.DocsView(g.picker.ViewId.DOCS);
      vista.setMimeTypes(MIMES);
      vista.setIncludeFolders(true);
      vista.setMode(g.picker.DocsViewMode.LIST);
      const picker = new g.picker.PickerBuilder()
        .setAppId(cfg.appId)
        .setOAuthToken(cfg.token)
        .setDeveloperKey(cfg.apiKey)
        .addView(vista)
        .setOrigin(window.location.origin)
        .setLocale("es")
        .setTitle("Elige tu Excel de cuentas")
        .setCallback(async (d) => {
          if (d.action === g.picker.Action.PICKED && d.docs?.[0]) {
            setOcupado(true);
            try {
              await guardar(d.docs[0].id);
            } finally {
              setOcupado(false);
            }
          } else if (d.action === g.picker.Action.CANCEL) {
            setOcupado(false);
          }
        })
        .build();
      picker.setVisible(true);
      setOcupado(false);
    } catch (e) {
      setError(ERRORES[e instanceof Error ? e.message : ""] ?? "No se pudo abrir el selector de Google.");
      setOcupado(false);
    }
  }

  return (
    <div>
      <button className="btn btn-primary" type="button" onClick={abrir} disabled={ocupado}>
        {ocupado ? "Abriendo…" : texto}
      </button>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
