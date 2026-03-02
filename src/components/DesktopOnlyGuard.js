import React, { useEffect, useState } from 'react';

export default function DesktopOnlyGuard({ children }) {
    const [isDesktop, setIsDesktop] = useState(true);

    useEffect(() => {
        const checkScreen = () => {
            setIsDesktop(window.innerWidth >= 1024);
        };

        checkScreen();
        window.addEventListener('resize', checkScreen);
        return () => window.removeEventListener('resize', checkScreen);
    }, []);

    if (!isDesktop) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] p-8 text-center space-y-6">
                <div className="p-6 bg-red-500/10 rounded-full text-red-400 border border-red-500/20">
                    <span className="material-symbols-outlined text-6xl">desktop_windows</span>
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">Vista Exclusiva de Escritorio</h2>
                <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-6 max-w-sm">
                    <p className="text-[var(--text-secondary-color)] mb-4">
                        La gestión de nómina requiere una pantalla grande para visualizar la matriz anual correctamente.
                    </p>
                    <p className="text-sm font-mono text-white/50">
                        Por favor, accede desde un computador (ancho &gt; 1024px).
                    </p>
                </div>
            </div>
        );
    }

    return children;
}
