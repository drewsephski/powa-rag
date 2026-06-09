"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      "rounded-lg border transition-colors hover:bg-muted/30",
      className,
    )}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group/faq flex flex-1 items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-left transition-colors hover:text-foreground/80",
        "data-[state=open]:pb-1",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-all duration-300 group-hover/faq:translate-x-1 data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const internalRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = internalRef.current
    if (!el) return

    const observer = new MutationObserver(() => {
      setIsOpen(el.dataset.state === "open")
    })
    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] })
    setIsOpen(el.dataset.state === "open")

    return () => observer.disconnect()
  }, [])

  return (
    <AccordionPrimitive.Content
      ref={(node) => {
        // Forward the ref
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
        // Also store it for the observer
        ;(internalRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node
      }}
      forceMount
      className={cn(className)}
      {...props}
    >
      <div className="overflow-hidden">
        <motion.div
          animate={{
            height: isOpen ? "auto" : 0,
            opacity: isOpen ? 1 : 0,
          }}
          transition={{
            duration: 0.3,
            ease: [0.04, 0.62, 0.23, 0.98],
          }}
        >
          <div className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            {children}
          </div>
        </motion.div>
      </div>
    </AccordionPrimitive.Content>
  )
})
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
