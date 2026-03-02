import React from "react";
import Layout from "../components/Layout";
import useTitle from "../useTitle";

export default function Wallet() {
  useTitle("Cartera · ATM Ricky Rich");
  return (
    <Layout title="Cartera">
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm w-full bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-6">
          <span className="material-symbols-outlined !text-5xl text-[var(--text-secondary-color)]" aria-hidden>build</span>
          <h2 className="mt-3 text-lg font-semibold">Funcionalidad no implementada</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary-color)]">Estamos trabajando para habilitar esta sección pronto.</p>
        </div>
      </div>
    </Layout>
  );
}
