import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GoogleAccessBanner from "@/components/GoogleAccessBanner";
import { ProveedorTareas } from "@/components/Tareas";
import { CLIENTE } from "@/lib/cliente";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${CLIENTE.nombre} · SEO Dashboard`,
  description: `Search Console analytics y publicación de contenido para ${CLIENTE.dominio}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* El proveedor va en el layout raíz a propósito: así una tarea de
            quince minutos sobrevive a cambiar de pestaña dentro del panel. Si
            viviera en la página, navegar la desmontaría y el trabajo quedaría
            huérfano, corriendo en el servidor sin que nadie se enterase. */}
        <ProveedorTareas>
          <GoogleAccessBanner />
          {children}
        </ProveedorTareas>
      </body>
    </html>
  );
}
