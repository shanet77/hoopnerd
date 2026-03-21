import React from "react";

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
          <label htmlFor={id} className="mb-2 text-sm font-bold text-gray-700 uppercase tracking-wide">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
              w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl
              text-gray-800 text-base transition-all duration-200
              shadow-[inset_0_2px_4px_rgba(0,0,0,0.04)]
              placeholder:text-gray-400
              focus:border-brand-400 focus:bg-white focus:outline-none
              focus-visible:ring-4 focus-visible:ring-brand-300 focus-visible:ring-offset-1
              focus:shadow-[0_0_0_4px_rgba(14,165,233,0.15),inset_0_2px_4px_rgba(0,0,0,0.04)]
              disabled:bg-gray-100 disabled:cursor-not-allowed
              read-only:bg-gray-100 read-only:text-gray-500 read-only:border-gray-300 read-only:cursor-pointer
              ${error ? "border-error focus:border-error focus:shadow-[0_0_0_4px_rgba(255,75,75,0.15)]" : ""}
              ${icon ? "pl-10" : ""}
            `}
            {...rest}
          />
        </div>
        {error && (
          <p
            id={errorId}
            className="mt-2 text-sm font-bold text-error flex items-center gap-1"
            role="alert"
          >
            <span>⚠</span> {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
