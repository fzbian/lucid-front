import React, { useState, useEffect, useRef } from 'react';
import { formatCLP } from '../formatMoney';

export default function EditableCurrencyInput({ value, onSave, label }) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        setTempValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleBlur = async () => {
        setIsEditing(false);
        if (tempValue !== value) {
            setSaving(true);
            await onSave(tempValue);
            setSaving(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
        if (e.key === 'Escape') {
            setTempValue(value);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="flex flex-col">
                <span className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider">{label}</span>
                <input
                    ref={inputRef}
                    type="number"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="bg-[var(--dark-color)] text-white font-bold p-1 rounded-md outline-none border border-[var(--primary-color)] w-32"
                />
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className="group cursor-pointer flex flex-col hover:bg-white/5 p-1 rounded-md transition-colors relative"
        >
            <span className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider group-hover:text-[var(--primary-color)] transition-colors">{label}</span>
            <div className="flex items-center gap-2">
                <span className="font-bold text-lg font-mono">{formatCLP(value)}</span>
                <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-100 text-[var(--text-secondary-color)]">edit</span>
                {saving && <span className="material-symbols-outlined text-xs animate-spin text-[var(--primary-color)]">sync</span>}
            </div>
        </div>
    );
}
