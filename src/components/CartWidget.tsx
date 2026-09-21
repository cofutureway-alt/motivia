import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/contexts/AuthContext";

export default function CartWidget({ className = "" }: { className?: string }) {
  const { user, profile } = useAuth();
  const { count } = useCart();
  if (!user || profile?.role === "admin") return null;
  return (
    <Link
      to="/cart"
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-secondary transition-colors ${className}`}
      aria-label="السلة"
    >
      <ShoppingCart className="w-5 h-5" />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
