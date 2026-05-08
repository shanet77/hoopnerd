import React from "react";

interface FeedbackBannerProps {
  children: React.ReactNode;
  variant?: "error" | "warning" | "info" | "success";
  icon?: React.ReactNode;
}

const variantStyles = {
  error: "bg-error-light border-error/30 text-error-dark",
  warning: "bg-warning-light border-warning/30 text-warning-dark",
  info: "bg-brand-100 border-brand/30 text-brand-700",
  success: "bg-success-light border-success/30 text-success-dark",
};

export const FeedbackBanner = ({
  children,
  variant = "info",
  icon,
}: FeedbackBannerProps) => {
  const isAlert = variant === "error";

  return (
    <div
      className={`p-3 border-2 rounded-xl ${variantStyles[variant]}`}
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
