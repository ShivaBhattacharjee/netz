"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import * as React from "react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"

function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("text-sm", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        month_caption: "flex h-8 items-center justify-center font-medium",
        nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
        button_previous: "inline-flex size-8 items-center justify-center hover:bg-muted disabled:opacity-40",
        button_next: "inline-flex size-8 items-center justify-center hover:bg-muted disabled:opacity-40",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs font-normal text-muted-foreground",
        week: "mt-1 flex",
        day: "size-9 p-0 text-center",
        day_button: "inline-flex size-9 items-center justify-center tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        today: "font-semibold underline underline-offset-4",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground/40 [&>button]:pointer-events-none",
        range_start: "bg-primary text-primary-foreground [&>button]:hover:bg-primary",
        range_end: "bg-primary text-primary-foreground [&>button]:hover:bg-primary",
        range_middle: "bg-muted [&>button]:hover:bg-muted",
        selected: "bg-primary text-primary-foreground",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />),
      }}
      {...props}
    />
  )
}

export { Calendar }
