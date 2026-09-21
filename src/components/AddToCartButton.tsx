import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/hooks/use-cart";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  bookId: string;
  bookType: "digital" | "physical";
  stockQuantity?: number | null;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
  fullWidth?: boolean;
}

export default function AddToCartButton({
  bookId,
  bookType,
  stockQuantity,
  size = "default",
  variant = "default",
  className,
  fullWidth,
}: Props) {
  const { addToCart, items } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const inCart = items.some((i) => i.book_id === bookId);
  const isOutOfStock = bookType === "physical" && stockQuantity !== undefined && stockQuantity !== null && stockQuantity <= 0;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    if (inCart) {
      navigate("/cart");
      return;
    }
    setLoading(true);
    await addToCart(bookId, bookType, stockQuantity);
    setLoading(false);
  };

  return (
    <Button
      size={size}
      variant={isOutOfStock ? "outline" : inCart ? "secondary" : variant}
      disabled={loading || isOutOfStock}
      onClick={handleClick}
      className={`${fullWidth ? "w-full" : ""} ${
        isOutOfStock ? "border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 cursor-not-allowed opacity-80" : ""
      } ${className ?? ""}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري الإضافة…
          </motion.span>
        ) : isOutOfStock ? (
          <motion.span key="os" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" /> نفدت الكمية بالمخزون
          </motion.span>
        ) : inCart ? (
          <motion.span key="in" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>عرض السلة</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </motion.span>
        ) : (
          <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> إضافة للسلة
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}


