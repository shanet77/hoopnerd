import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card = ({
  children,
  className = "",
  hover = false,
}: CardProps) => {
  return (
    <div
      className={`
        bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6
        transition-all duration-200
        ${hover ? "hover:bg-gray-50/50 dark:hover:bg-gray-700/50" : ""}
        ${className}
      `}
      style={{ animation: "slide-up 0.3s ease-out" }}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = "" }: CardProps) => {
  return <div className={`mb-4 ${className}`}>{children}</div>;
};

export const CardTitle = ({ children, className = "" }: CardProps) => {
  return (
    <h2 className={`font-title text-xl font-bold text-gray-800 dark:text-gray-100 ${className}`}>
      {children}
    </h2>
  );
};

export const CardDescription = ({ children, className = "" }: CardProps) => {
  return (
    <p className={`text-gray-500 dark:text-gray-400 text-sm mt-1 ${className}`}>{children}</p>
  );
};

export const CardContent = ({ children, className = "" }: CardProps) => {
  return <div className={className}>{children}</div>;
};

export const CardFooter = ({ children, className = "" }: CardProps) => {
  return (
    <div className={`mt-4 pt-4 border-t-2 border-gray-100 dark:border-gray-700 ${className}`}>
      {children}
    </div>
  );
};
