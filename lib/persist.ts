import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileP = promisify(execFile);

/**
 * Persistencia gratis para Render free tier: hace commit + push al repo de
 * GitHub cada vez que el sistema genera contenido nuevo (ideas, blogs,
 * portadas). Sin esto, los archivos se pierden al reiniciar la instancia.
 *
 * Activado SOLO si GIT_PERSIST_TOKEN está seteado. En local (sin env var) es
 * un no-op para no spamear commits.
 */
export async function persistChanges(message: string, files: string[]): Promise<void> {
  const token = process.env.GIT_PERSIST_TOKEN;
  if (!token) return; // local: no commitea

  const repo = process.env.GIT_PERSIST_REPO; // ej. "MSTG-FastStrat-LLC/faststrat-seo"
  const branch = process.env.GIT_PERSIST_BRANCH ?? "main";
  const user = process.env.GIT_PERSIST_USER ?? "FastStrat Bot";
  const email = process.env.GIT_PERSIST_EMAIL ?? "bot@faststrat.ai";
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
    if (!status.stdout.trim()) return;

    await run(["commit", "-m", `[auto] ${message}`]);
    await run(["push", remote, `HEAD:${branch}`]);
  } catch (err) {
    // Fallar persist no debe romper la operación principal; lo logueamos.
    // El mensaje de execFile trae la línea de comando entera, y ahí va el
    // token dentro de la URL del remoto. Se redacta antes de imprimir: un PAT
    // con permiso de escritura en un log es un PAT que hay que rotar.
    const crudo = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string })?.stderr ?? "";
    const limpio = (s: string) => s.split(token).join("***");
    console.error("[persist] fallo:", limpio(crudo), limpio(stderr));
  }
}
