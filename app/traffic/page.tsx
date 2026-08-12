import { redirect } from "next/navigation";

// Tráfico se fusionó con el Dashboard.
//
// Desde que el Dashboard cruza Search Console con GA4, las dos pantallas
// mostraban los mismos datos con el mismo diagnóstico, calculado por la misma
// función. Dos sitios para una pregunta obligan a elegir cuál mirar y a
// mantener el mismo cálculo por duplicado.
//
// La ruta se queda como redirección en vez de borrarse: hay enlaces guardados
// y pestañas abiertas apuntando aquí, y un 404 no explica a dónde se fue.
export default function TrafficRedirect() {
  redirect("/");
}
