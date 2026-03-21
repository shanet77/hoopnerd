import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "success" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) => {
  const baseStyles =
    "font-bold py-3 px-6 rounded-2xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-[0_4px_0_var(--shadow-color)] hover:translate-y-[-2px] hover:shadow-[0_6px_0_var(--shadow-color)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--shadow-color)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

  const sizeStyles = {
    sm: "py-2 px-4 text-sm",
    md: "py-3 px-6 text-base",
    lg: "py-4 px-8 text-lg",
  };

  const variantStyles = {
    primary:
      "bg-basketball text-white hover:bg-basketball-light active:bg-basketball-dark",
    secondary:
      "bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-white hover:border-gray-400 active:bg-gray-200",
    success:
      "bg-success text-white hover:bg-success-light hover:text-success-dark",
    danger: "bg-error text-white hover:bg-error-light hover:text-error-dark",
    outline:
      "bg-transparent border-3 border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700",
  };

  const shadowColors = {
    primary: "rgba(255, 75, 35, 0.4)",
    secondary: "rgba(0, 0, 0, 0.1)",
    success: "rgba(88, 204, 2, 0.4)",
    danger: "rgba(255, 75, 75, 0.4)",
    outline: "rgba(0, 0, 0, 0.1)",
  };

  const style = {
    "--shadow-color": shadowColors[variant],
  } as React.CSSProperties;

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
};
