import { twMerge } from "tailwind-merge";
import { motion, type HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export const GlassCard = ({ children, className, hover = false, ...props }: GlassCardProps) => {
  return (
    <motion.div
      initial={false}
      className={twMerge(
        "glass rounded-2xl p-6 transition-all duration-300",
        hover && "glass-hover hover:scale-[1.01] hover:shadow-2xl hover:shadow-cyan-500/10 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};
