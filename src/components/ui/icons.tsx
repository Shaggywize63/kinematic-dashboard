'use client';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Activity, AlertTriangle, ArrowLeftRight, Award, BadgePercent, Banknote, BarChart3,
  Bell, BookOpen, Boxes, Briefcase, Building2, CalendarCheck, CalendarDays, Camera,
  CheckSquare, ChevronRight, CircleHelp, ClipboardCheck, ClipboardList, Clock,
  Compass, Contact, CreditCard, Eye, FileSpreadsheet, FileText, Gauge, Gift,
  Handshake, Home, IndianRupee, Inbox, Kanban, Landmark, Layers, LayoutDashboard,
  LineChart, Link2, ListChecks, Locate, Mail, MailCheck, MailPlus, Map, MapPin,
  MapPinned, Megaphone, MessageCircle, MessageSquare, MessageSquareText, Mic,
  Network, Package, PackageCheck, PackageX, Percent, Radio, Receipt, Route,
  ScrollText, Send, Settings, ShieldAlert, ShoppingCart, SlidersHorizontal,
  Sparkles, Store, Tag, Tags, Target, Timer, TrendingUp, Trophy, Truck, Undo2,
  UserCheck, UserPlus, Users, Wallet, Warehouse,
} from 'lucide-react';

/**
 * The one stroke-icon family the dashboard chrome renders from. Every nav item
 * carries the NAME of an icon here (a string, so the sidebar editor, the ⌘K
 * palette and the sidebar itself all draw the same glyph from the same
 * registry). 1.6px strokes on a 24-grid, sized 18px in nav rows — matches the
 * design-system sheet. Add a name here before referencing it from the nav.
 */
export const NAV_ICONS = {
  activity: Activity,
  alert: AlertTriangle,
  analytics: BarChart3,
  audit: ScrollText,
  award: Award,
  bell: Bell,
  book: BookOpen,
  boxes: Boxes,
  briefcase: Briefcase,
  building: Building2,
  calendar: CalendarDays,
  calendarCheck: CalendarCheck,
  camera: Camera,
  cart: ShoppingCart,
  chat: MessageSquare,
  chatText: MessageSquareText,
  check: CheckSquare,
  chevron: ChevronRight,
  claims: Handshake,
  clipboard: ClipboardList,
  clipboardCheck: ClipboardCheck,
  clock: Clock,
  compass: Compass,
  contact: Contact,
  creditCard: CreditCard,
  dashboard: LayoutDashboard,
  eye: Eye,
  fileSheet: FileSpreadsheet,
  fileText: FileText,
  gauge: Gauge,
  gift: Gift,
  help: CircleHelp,
  home: Home,
  inbox: Inbox,
  kanban: Kanban,
  landmark: Landmark,
  layers: Layers,
  lineChart: LineChart,
  link: Link2,
  listChecks: ListChecks,
  locate: Locate,
  mail: Mail,
  mailCheck: MailCheck,
  mailPlus: MailPlus,
  map: Map,
  mapPin: MapPin,
  mapPinned: MapPinned,
  megaphone: Megaphone,
  messageCircle: MessageCircle,
  mic: Mic,
  network: Network,
  package: Package,
  packageCheck: PackageCheck,
  packageX: PackageX,
  percent: Percent,
  badgePercent: BadgePercent,
  radio: Radio,
  receipt: Receipt,
  route: Route,
  rupee: IndianRupee,
  banknote: Banknote,
  send: Send,
  settings: Settings,
  shield: ShieldAlert,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  store: Store,
  swap: ArrowLeftRight,
  tag: Tag,
  tags: Tags,
  target: Target,
  timer: Timer,
  trending: TrendingUp,
  trophy: Trophy,
  truck: Truck,
  undo: Undo2,
  userCheck: UserCheck,
  userPlus: UserPlus,
  users: Users,
  wallet: Wallet,
  warehouse: Warehouse,
} as const satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

/**
 * Legacy nav data carried raw SVG path strings (`'M3 9l9-7 …'`). Anything that
 * still hands one of those in gets it drawn as before, so a saved sidebar
 * preference or a stale caller never renders an empty glyph.
 */
function PathGlyph({ d, size, strokeWidth }: { d: string; size: number; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

export function NavIcon({
  name, size = 18, strokeWidth = 1.6, ...rest
}: { name?: string; size?: number; strokeWidth?: number } & Omit<LucideProps, 'size' | 'strokeWidth' | 'ref'>) {
  if (!name) return <ChevronRight size={size} strokeWidth={strokeWidth} aria-hidden style={{ flexShrink: 0 }} {...rest} />;
  const Cmp = (NAV_ICONS as Record<string, LucideIcon>)[name];
  if (Cmp) return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden style={{ flexShrink: 0 }} {...rest} />;
  return <PathGlyph d={name} size={size} strokeWidth={strokeWidth} />;
}
