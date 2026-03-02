import React, { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
// import { useNavigate } from "react-router-dom"; // Not needed directly if Sidebar handles nav

export default function Layout({ children, title, titleImage, titleImageClass, ...headerProps }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[var(--background-color)] text-[var(--text-color)]">
            {/* Sidebar handles its own responsive visibility (Hidden < lg, Fixed >= lg) */}
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content Area - Pushed by sidebar on desktop */}
            <div className="flex-1 flex flex-col min-w-0 lg:pl-64 transition-all duration-300">

                {/* Header with Mobile Menu Trigger */}
                <Header
                    title={title}
                    titleImage={titleImage}
                    titleImageClass={titleImageClass}
                    onMenuClick={() => setSidebarOpen(true)}
                    {...headerProps}
                />

                {/* Scrollable Page Content */}
                <main className="flex-1 p-4 pb-8 lg:pb-8 lg:p-8 animate-fade-in relative">
                    {children}
                </main>
            </div>
        </div>
    );
}
