import React, { useEffect, useState } from "react";

const DESKTOP_MIN_WIDTH = 1024;

function getIsDesktop() {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

export default function DesktopOnlyCartera({ children }) {
  const [isDesktop, setIsDesktop] = useState(getIsDesktop);

  useEffect(() => {
    const handleResize = () => setIsDesktop(getIsDesktop());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (isDesktop) return children;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-6 py-10 text-[var(--text-color)]">
      <section className="w-full max-w-xl rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-8 text-center shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white">
          <span className="material-symbols-outlined text-4xl" aria-hidden>desktop_windows</span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-white">Cartera solo está disponible en computador</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary-color)]">
          Esta sección necesita más espacio horizontal para revisar clientes, facturas, abonos y valores con claridad.
          Ingresa desde un equipo de escritorio o una ventana más amplia para continuar.
        </p>
      </section>
    </div>
  );
}
