import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackToMcqPage() {
  return (
    <Link href="/mcqs" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
      Back to MCQ page
    </Link>
  );
}
