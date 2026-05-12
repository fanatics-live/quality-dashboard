import type { Grade } from "@/lib/types";
import { GRADE_CONFIG } from "@/lib/quality/grading";
import { cn } from "@/lib/utils";

export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "sm" | "md" | "lg" }) {
  const config = GRADE_CONFIG[grade];
  const sizeClasses = {
    sm: "w-8 h-8 text-sm rounded-md",
    md: "w-12 h-12 text-xl rounded-xl",
    lg: "w-16 h-16 text-3xl rounded-2xl",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-black text-white shrink-0",
        config.bg,
        sizeClasses[size],
      )}
    >
      {grade}
    </div>
  );
}
