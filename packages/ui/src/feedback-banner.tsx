import React from "react";

interface FeedbackBannerProps {
  children: React.ReactNode;
  variant?: "error" | "warning" | "info" | "success";
  icon?: React.ReactNode;
}

const variantStyles = {
  error: "bg-error-light dark:bg-error/20 text-error-dark dark:text-error-light",
  warning:
    "bg-warning-light dark:bg-warning/20 text-warning-dark dark:text-warning-light",
  info: "bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300",
  success:
    "bg-success-light dark:bg-success/20 text-success-dark dark:text-success-light",
};

export const FeedbackBanner = ({
  children,
  variant = "info",
  icon,
}: FeedbackBannerProps) => {
  const isAlert = variant === "error";

  return (
    <div
      className={`px-4 py-3 rounded-md ${variantStyles[variant]}`}
      role={isAlert ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-xl shrink-0">{icon}</span>}
        <p className="text-sm font-bold text-center flex-1">{children}</p>
      </div>
    </div>
  );
};
