import Link from "next/link";
import { Marca } from "@/components/iconos";

export default function NoEncontrada() {
  return (
    <main className="acceso">
      <Marca tam={48} />
      <h1>Esta página no existe</h1>
      <p>La dirección no lleva a ninguna parte de Mi Panel.</p>
      <Link className="boton boton-primario" href="/">
        Ir al inicio
      </Link>
    </main>
  );
}
