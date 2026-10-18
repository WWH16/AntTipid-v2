import {
  Briefcase, Bus, Gift, HeartPulse, Laptop, Popcorn, ReceiptText,
  ShoppingBag, ShoppingBasket, Smartphone, Tag, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed, groceries: ShoppingBasket, transport: Bus, bills: ReceiptText,
  phone: Smartphone, shopping: ShoppingBag, health: HeartPulse, fun: Popcorn,
  salary: Briefcase, freelance: Laptop, gift: Gift, other: Tag,
}
