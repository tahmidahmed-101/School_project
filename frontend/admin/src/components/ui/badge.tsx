import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-transparent gap-1.5 px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-500",
        secondary:
          "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
        destructive:
          "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-500",
        outline: "border-border text-foreground",
        success:
          "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-500",
        warning:
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-500",
        info: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
