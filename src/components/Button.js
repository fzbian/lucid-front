import React from "react";

export default function Button({
  children,
  variant = "primary",
  icon,
  disabled = false,
  className = "",
  ...props
}) {
  const base = [
    "w-full font-medium py-3 px-4 rounded-lg",
    "flex items-center justify-center gap-2",
    "transform-gpu will-change-transform",
    "transition-all duration-150",
    disabled ? "opacity-60 cursor-not-allowed" : "hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.98]",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
    "shadow-md hover:shadow-lg",
  ].join(' ');

  const variants = {
    primary: "bg-[var(--primary-color)] text-white hover:opacity-95",
    secondary: "bg-transparent border border-[var(--primary-color)] text-[var(--primary-color)] hover:bg-white/5",
    danger: "bg-[var(--danger-color)] text-white hover:opacity-95",
  };
  const style = variants[variant] || variants.primary;

  return (
    <button className={`${base} ${style} ${className}`} disabled={disabled} {...props}>
      {icon && <span className="material-symbols-outlined transition-transform duration-150 group-hover:translate-x-0.5">{icon}</span>}
      {children}
    </button>
  );
}
