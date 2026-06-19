/**
 * Cafe OS shared UI barrel.
 * Import primitives + icons from one place:
 *   import { ThemeToggle, Modal, Spinner, Coffee } from '@/components/ui';
 *
 * Icons are re-exported from lucide-react (tree-shaken). Use a consistent
 * size (16 inline, 18 controls, 20–24 headers) and the default strokeWidth.
 */
export { ThemeToggle, useTheme } from './ThemeToggle';
export { Modal } from './Modal';
export { Spinner, Skeleton, EmptyState, Banner } from './feedback';
export { AlphaTag } from './AlphaTag';

export {
  // navigation / chrome
  Menu, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, ArrowRight,
  Search, Settings, LogOut, Bell, MoreVertical, Plus, Minus, Check, Filter, Delete,
  // theme
  Sun, Moon,
  // POS / cafe
  Coffee, CupSoda, UtensilsCrossed, ShoppingCart, Receipt, CreditCard, Wallet, IndianRupee,
  Percent, Tag, Trash2, Pencil, Printer, Banknote, QrCode, Table2, Users, User, Hash,
  Croissant, Cake, Smartphone,
  // KDS / orders
  ChefHat, Flame, Clock, Timer, CircleCheck, CircleAlert, Soup, Bell as BellRing, Hourglass,
  // dashboard / data
  LayoutDashboard, TrendingUp, TrendingDown, BarChart3, LineChart, PieChart, Package,
  Boxes, Truck, ClipboardList, CalendarDays, UserCog, Store, Megaphone, Gift, Trophy,
  Star, Heart, Sparkles, Gamepad2, Dices, PartyPopper, Crown, Coins,
  // status / feedback
  CircleCheckBig, TriangleAlert, Info, CircleX, Loader, RefreshCw, Eye, EyeOff,
  Wifi, WifiOff, Lock, Phone, MapPin, Image as ImageIcon, Upload, Download,
} from 'lucide-react';

export type { LucideIcon } from 'lucide-react';
