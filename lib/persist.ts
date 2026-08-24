import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { CLIENTE } from "@/lib/cliente";

const execFileP = promisify(execFile);

/**
 * Persistencia gratis para Render free tier: hace commit + push al repo de
 * GitHub cada vez que el sistema genera contenido nuevo (ideas, blogs,
 * portadas). Sin esto, los archivos se pierden al reiniciar la instancia.
 *
 * Activado SOLO si GIT_PERSIST_TOKEN está seteado. En local (sin env var) es
 * un no-op para no spamear commits.
 */
/** Qué pasó al intentar guardar. Se devuelve para poder DECIRLO, no para tirar. */
export interface ResultadoPersist {
  /** true solo si quedó commiteado y empujado, o si no había nada que guardar. */
  ok: boolean;
  /** Por qué no se pudo, ya redactado (sin el token dentro). */
  error?: string;
  /** true en local, donde no commitear es lo correcto y no un fallo. */
  desactivado?: boolean;
}

/**
 * Guarda en el repositorio lo que el sistema genera.
 *
 * Devuelve el resultado en vez de tragárselo. Antes esta función no devolvía
 * nada y los fallos solo iban a la consola del servidor: el analista corrió
 * nueve minutos el lunes, produjo el informe entero, no se pudo commitear, y
 * la respuesta dijo que todo había ido bien. El disco de Render se borra al
 * reiniciar la instancia, así que el informe desapareció y no quedó ni rastro
 * de por qué. Quien mira el resultado tiene que poder ver esa diferencia.
 */
export async function persistChanges(message: string, files: string[]): Promise<ResultadoPersist> {
  const token = process.env.GIT_PERSIST_TOKEN;
  // En local no commitear es el comportamiento correcto, no un fallo.
  if (!token) return { ok: true, desactivado: true };

  const repo = process.env.GIT_PERSIST_REPO; // ej. "organizacion/repositorio"
  const branch = process.env.GIT_PERSIST_BRANCH ?? "main";
  const user = process.env.GIT_PERSIST_USER ?? `${CLIENTE.nombre} Bot`;
  const email = process.env.GIT_PERSIST_EMAIL ?? `bot@${CLIENTE.dominio}`;
  if (!repo) throw new Error("Falta GIT_PERSIST_REPO");

  const cwd = process.cwd();
  const remote = `https://x-access-token:${token}@github.com/${repo}.git`;

  const run = (args: string[]) => execFileP("git", args, { cwd });

  try {
    // Asegura identidad y remote en cada llamada (la instancia puede no preservar config).
    await run(["config", "user.email", email]);
    await run(["config", "user.name", user]);

    // Stage solo los archivos puntuales (no toda la app).
    for (const f of files) await run(["add", "--", path.relative(cwd, f)]);

    // ¿Hay cambios para commitear?
    const status = await run(["status", "--porcelain"]);
    if (!status.stdout.trim()) return { ok: true };

    await run(["commit", "-m", `[auto] ${message}`]);
    await run(["push", remote, `HEAD:${branch}`]);
    return { ok: true };
  } catch (err) {
    // Fallar persist no rompe la operación principal, pero SÍ se cuenta.
    // El mensaje de execFile trae la línea de comando entera, y ahí va el
    // token dentro de la URL del remoto. Se redacta antes de salir a ningún
    // sitio: un PAT con permiso de escritura en un log es un PAT que rotar.
    const crudo = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string })?.stderr ?? "";
    const limpio = (s: string) => s.split(token).join("***");
    const motivo = `${limpio(crudo)} ${limpio(stderr)}`.trim().slice(0, 500);
    console.error("[persist] fallo:", motivo);
    return { ok: false, error: motivo };
  }
}
