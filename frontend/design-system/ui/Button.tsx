import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader } from "@/design-system/patterns/Loader";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover",
  secondary: "bg-action text-action-fg shadow-sm hover:bg-action-hover",
  outline: "border border-ink-200 bg-white text-ink-900 hover:border-gold-500",
  ghost: "text-ink-700 hover:text-ink-950",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-sm",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassOptions = {}) {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className].filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonClassOptions, "className"> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Loader variant="inline" /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
