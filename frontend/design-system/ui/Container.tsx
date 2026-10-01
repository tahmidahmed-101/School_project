import type { ElementType, HTMLAttributes } from "react";

const WIDTHS = {
  default: "max-w-7xl",
  prose: "max-w-3xl",
  compact: "max-w-xl",
  narrow: "max-w-md",
} as const;

export type ContainerWidth = keyof typeof WIDTHS;

export function containerClass(width: ContainerWidth = "default", className?: string) {
  return ["mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTHS[width], className].filter(Boolean).join(" ");
}

interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  width?: ContainerWidth;
}

export function Container({ as: Tag = "div", width = "default", className, ...rest }: ContainerProps) {
  return <Tag className={containerClass(width, className)} {...rest} />;
}
