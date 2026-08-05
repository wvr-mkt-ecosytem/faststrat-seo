"use client";

import { useEffect, useState } from "react";

// Avisa una sola vez, arriba, cuando Search Console deja de responder.
//
// Portado del sistema de Leasey después de que allí se borrara la cuenta de
// Google que había emitido los tokens. Sin esto, un token caducado no se ve
// como un problema de conexión: se ve como pestañas vacías y botones que no
// hacen nada, cada una descubriéndolo por su cuenta. La causa es una sola y no
// aparecía en ninguna pantalla.
//
// La distinción que hace falta es "no hay datos" contra "no hay acceso": lo
// primero manda a mirar el sitio, lo segundo a reconectar la cuenta.

interface Probe {
  connected?: boolean;
  kind?: string;
  error?: string;
}

export default function GoogleAccessBanner() {
  const [state, setState] = useState<Probe | null>(null);

  useEffect(() => {
    // La consulta más barata que toca Search Console: si pasa, hay acceso.
    fetch("/api/gsc?days=7")
      .then((r) => r.json())
      .then((j) => setState(j))
      .catch(() => setState({ connected: false, error: "Could not reach the server." }));
  }, []);

  if (!state) return null;
  const broken = state.connected === false || state.kind === "auth";
  if (!broken) return null;

  const isAuth = state.kind === "auth" || /invalid_grant|deleted|revoked|expired/i.test(state.error || "");

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 text-amber-900 px-5 py-2.5 text-[13px] leading-relaxed"
    >
      <div className="max-w-6xl mx-auto flex flex-col gap-0.5">
        <strong>
          {isAuth
            ? "Search Console access is not valid, so every view that reads search data is empty."
            : "Search Console data could not be loaded."}
        </strong>
        <span className="text-amber-800">
          {isAuth
            ? "Reissue GOOGLE_REFRESH_TOKEN from an account with access to the property, here and in Render. The pages themselves are fine."
            : state.error}
        </span>
      </div>
    </div>
  );
}
