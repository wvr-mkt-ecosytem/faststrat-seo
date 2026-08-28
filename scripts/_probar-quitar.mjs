import fs from "fs";
import matter from "gray-matter";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (l.includes("=") && !l.trim().startsWith("#")) {
    const i = l.indexOf("="); process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
  }
}
register("data:text/javascript," + encodeURIComponent(`
  const raiz = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
  export async function resolve(e, c, s) {
    if (e.startsWith("@/")) return s(new URL(e.slice(2) + ".ts", raiz).href, c);
    return s(e, c);
  }`), import.meta.url);

const { dejarPublicable } = await import("@/lib/publicable");
const f = "content/blog/how-allocate-your-smb-ai-marketing-budget-where-your-7-10.md";
const { data, content } = matter(fs.readFileSync(f, "utf8"));

console.log("Antes: 5 bloqueos por cifras sin fuente.\n");
const t0 = Date.now();
const r = await dejarPublicable(data.title, content, { metaDescription: data.excerpt });
console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min]`);
console.log("  bloqueos que quedan:", r.qa.blocking.length);
console.log("  pasadas del agente: ", r.pasadas);
console.log("  cifras quitadas:    ", r.quitadas.length);
for (const q of r.quitadas) console.log("     -", q.slice(0, 70));
for (const b of r.qa.blocking) console.log("   sigue bloqueando:", b.detail.slice(0, 80));

if (r.qa.blocking.length === 0) {
  fs.writeFileSync(f, matter.stringify(r.markdown.trim() + "\n", data));
  console.log("\nGuardado. El artículo ya puede publicarse.");
  // ¿Se coló alguna vaguedad al quitar las cifras?
  const vago = r.markdown.match(/\b(muchas|la mayoría|gran parte|un porcentaje significativo|significativamente|numerosas)\b/gi);
  console.log("vaguedades introducidas:", vago ? [...new Set(vago)].join(", ") : "ninguna");
  console.log("palabras:", r.markdown.split(/\s+/).filter(Boolean).length);
}
