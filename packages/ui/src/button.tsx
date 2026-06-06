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
    "font-bold py-3 px-6 rounded-2xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900";

  const sizeStyles = {
    sm: "py-2 px-4 text-sm",
    md: "py-3 px-6 text-base",
    lg: "py-4 px-8 text-lg",
  };

  const variantStyles = {
    primary:
      "bg-basketball text-white hover:bg-basketball-light active:bg-basketball-dark",
    secondary:
      "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-500 active:bg-gray-200 dark:active:bg-gray-800",
    success:
      "bg-success text-white hover:bg-success-light hover:text-success-dark",
    danger: "bg-error text-white hover:bg-error-light hover:text-error-dark",
    outline:
      "bg-transparent border-3 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-200",
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
