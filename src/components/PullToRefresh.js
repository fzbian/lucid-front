import React, { useState, useEffect, useRef } from 'react';

export default function PullToRefresh({ onRefresh, children }) {
    const [startY, setStartY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const containerRef = useRef(null);

    const THRESHOLD = 150; // pixels to pull to trigger refresh

    const handleTouchStart = (e) => {
        if (containerRef.current.scrollTop === 0) {
            setStartY(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e) => {
        const y = e.touches[0].clientY;
        if (containerRef.current.scrollTop === 0 && y > startY && !refreshing) {
            const pull = Math.min((y - startY) * 0.5, 200); // 0.5 dampening
            setPullDistance(pull);
        }
    };

    const handleTouchEnd = async () => {
        if (pullDistance > 60 && !refreshing) {
            setRefreshing(true);
            setPullDistance(60); // Snap to loading position
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    };

    return (
        <div
            ref={containerRef}
            className="h-full overflow-y-auto relative no-scrollbar"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                style={{ height: pullDistance, transition: refreshing ? 'height 0.2s' : 'height 0.1s' }}
                className="flex items-center justify-center overflow-hidden bg-[var(--background-color)]"
            >
                <span className={`material-symbols-outlined text-[var(--primary-color)] ${refreshing || pullDistance > 60 ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }}>
                    refresh
                </span>
            </div>
            {children}
        </div>
    );
}
