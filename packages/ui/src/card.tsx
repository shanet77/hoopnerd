import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  spotlight?: boolean;
}

export const Card = ({
  children,
  className = "",
  hover = false,
  spotlight = false,
}: CardProps) => {
  return (
    <div
      className={`
        bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6
        transition-all duration-200
        ${hover ? "hover:bg-gray-50/50 dark:hover:bg-gray-700/50" : ""}
        ${spotlight ? "border-l-4 border-l-basketball shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.25)]" : ""}
        ${className}
      `}
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
