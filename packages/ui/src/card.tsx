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
        bg-white rounded-2xl border-2 border-gray-200 p-6
        shadow-[0_4px_0_rgba(0,0,0,0.08)]
        transition-all duration-200
        ${hover ? "hover:-translate-y-1 hover:shadow-[0_6px_0_rgba(0,0,0,0.12)] active:translate-y-0 active:shadow-[0_2px_0_rgba(0,0,0,0.08)]" : ""}
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
    <h2 className={`text-xl font-bold text-gray-800 ${className}`}>
      {children}
    </h2>
  );
};

export const CardDescription = ({ children, className = "" }: CardProps) => {
  return (
    <p className={`text-gray-500 text-sm mt-1 ${className}`}>{children}</p>
  );
};

export const CardContent = ({ children, className = "" }: CardProps) => {
  return <div className={className}>{children}</div>;
};

export const CardFooter = ({ children, className = "" }: CardProps) => {
  return (
    <div className={`mt-4 pt-4 border-t-2 border-gray-100 ${className}`}>
      {children}
    </div>
  );
};
