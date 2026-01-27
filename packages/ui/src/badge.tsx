import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "error" | "warning" | "info" | "neutral" | "basketball";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const Badge = ({
  children,
  variant = "info",
  size = "md",
  className = "",
}: BadgeProps) => {
  const variantStyles = {
    success: "bg-success-light text-success-dark",
    error: "bg-error-light text-error-dark",
    warning: "bg-warning-light text-warning-dark",
    info: "bg-brand-100 text-brand-700",
    neutral: "bg-gray-200 text-gray-600",
    basketball: "bg-basketball text-white",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  return (
    <span
      className={`
        inline-flex items-center font-bold uppercase tracking-wide rounded-full
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}
      `}
    >
      {children}
    </span>
  );
};
