import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = ({
  label,
  error,
  className = "",
  ...rest
}: InputProps) => {
  const inputStyles =
    "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed";
  const errorStyles = error ? "border-red-500 focus:ring-red-500" : "";

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label className="mb-1 text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input className={`${inputStyles} ${errorStyles}`} {...rest} />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};
