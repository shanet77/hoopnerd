import React from "react";
import { TriangleAlert } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = "", id, ...rest }, ref) => {
    const errorId = id ? `${id}-error` : undefined;

    return (
      <div className={`flex flex-col ${className}`}>
        {label && (
          <label htmlFor={id} className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={Boolean(error)}
            aria-describedby={error && errorId ? errorId : undefined}
            className={`
              w-full px-4 py-3 bg-gray-100/60 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md
              text-gray-800 dark:text-gray-100 text-base transition-all duration-200
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:border-brand-400 dark:focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none
              focus-visible:ring-4 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700 focus-visible:ring-offset-1
              disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
              read-only:bg-gray-100 dark:read-only:bg-gray-800 read-only:text-gray-500 dark:read-only:text-gray-400 read-only:border-gray-300 dark:read-only:border-gray-600 read-only:cursor-pointer
              ${error ? "border-error focus:border-error focus:shadow-[0_0_0_4px_rgba(207,63,75,0.16)]" : ""}
              ${icon ? "pl-10" : ""}
            `}
            {...rest}
          />
        </div>
        {error && (
          <p
            id={errorId}
            className="mt-2 text-sm font-bold text-error dark:text-error-light flex items-center gap-1"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
