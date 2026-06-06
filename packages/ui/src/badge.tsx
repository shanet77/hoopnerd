import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "success" | "error" | "warning" | "info" | "neutral" | "basketball";
  size?: "sm" | "md" | "lg";
}

export const Badge = ({
  children,
  variant = "info",
  size = "md",
  className = "",
  ...rest
}: BadgeProps) => {
  const variantStyles = {
    success: "bg-success-light text-success-dark",
    error: "bg-error-light text-error-dark",
    warning: "bg-warning-light text-warning-dark",
    info: "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300",
    neutral: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
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
      {...rest}
    >
      {children}
    </span>
  );
};
