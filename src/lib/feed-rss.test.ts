import test from "node:test";
import assert from "node:assert/strict";
import { rss, tituloEpisodio } from "./feed-rss.ts";

test("título del episodio en español", () => {
  assert.equal(tituloEpisodio("2026-11-09"), "Resumen del lunes 9 de noviembre");
});

test("un resumen rehecho es otro episodio (guid y dirección con versión) y se escapa el XML", () => {
  const base = "https://panel.example.com/api/feed/tok&en";
  const a = rss(base, [{ fecha: "2026-11-09", bytes: 1234, creado: "2026-11-09T05:30:00Z" }]);
  const b = rss(base, [{ fecha: "2026-11-09", bytes: 1234, creado: "2026-11-09T09:00:00Z" }]);
  const guid = (x: string) => /<guid[^>]*>([^<]+)<\/guid>/.exec(x)?.[1];
  assert.notEqual(guid(a), guid(b));
  assert.match(a, /<enclosure url="https:\/\/panel\.example\.com\/api\/feed\/tok&amp;en\/2026-11-09\.mp3\?v=\d+" length="1234" type="audio\/mpeg"\/>/);
  assert.match(a, /<itunes:block>yes<\/itunes:block>/);
});
