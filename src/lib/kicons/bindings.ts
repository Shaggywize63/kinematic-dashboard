/**
 * Which lucide icon each designed glyph replaces: lucide export name → glyph id (see glyphs.ts).
 *
 * Several export names often point at one glyph (aliases: `CheckCircle2` / `CircleCheck` / `CheckCircle`; the
 * `Pencil` family). Names not listed here are not replaced — they keep their lucide drawing, so the long tail of
 * one-off icons never breaks, it just isn't redrawn yet.
 *
 * To redraw another icon: add the glyph in glyphs-*.ts, add its lucide name here, then run
 * `node scripts/gen-kicon-targets.mjs` (the contract test fails if the generated file is stale).
 */
export const BINDINGS: Readonly<Record<string, string>> = {
  // marks & arrows
  Plus: 'plus', Minus: 'minus', X: 'x', Check: 'check', CheckCheck: 'check-check',
  ChevronRight: 'chevron-right', ChevronLeft: 'chevron-left', ChevronDown: 'chevron-down',
  ArrowRight: 'arrow-right', ArrowLeft: 'arrow-left', ArrowUp: 'arrow-up', ArrowDown: 'arrow-down', ArrowUpDown: 'arrow-up-down',
  ArrowLeftRight: 'arrow-left-right', ArrowRightLeft: 'arrow-left-right', ArrowUpRight: 'arrow-up-right',
  ArrowDownToLine: 'arrow-down-to-line', ArrowUpFromLine: 'arrow-up-from-line',
  Download: 'download', Upload: 'upload', ExternalLink: 'external-link', RefreshCw: 'refresh', RotateCcw: 'rotate-ccw', Undo2: 'undo',
  Link2: 'link', LogIn: 'log-in', LogOut: 'log-out', Loader2: 'loader', LoaderCircle: 'loader', Power: 'power', PowerOff: 'power-off',
  AlignLeft: 'align-left', List: 'list', ListOrdered: 'list-ordered', ListChecks: 'list-checks', Hash: 'hash', Type: 'type',
  Menu: 'menu', MoreHorizontal: 'more-horizontal', MoreVertical: 'more-vertical', Paperclip: 'paperclip',

  // states
  CheckCircle2: 'check-circle', CheckCircle: 'check-circle', CircleCheck: 'check-circle', CircleCheckBig: 'check-circle',
  XCircle: 'x-circle', CircleX: 'x-circle', CircleDot: 'circle-dot', Circle: 'circle', PauseCircle: 'pause-circle',
  AlertTriangle: 'alert-triangle', TriangleAlert: 'alert-triangle', OctagonAlert: 'alert-triangle',
  AlertCircle: 'alert-circle', CircleAlert: 'alert-circle', Info: 'info', CircleHelp: 'help', HelpCircle: 'help', Ban: 'ban',
  ShieldCheck: 'shield-check', ShieldAlert: 'shield-alert', Play: 'play', Pause: 'pause', SkipForward: 'skip-forward',

  // actions & controls
  Pencil: 'pencil', Edit3: 'pencil', PenLine: 'pencil', PencilLine: 'pencil', PenSquare: 'pencil', Edit: 'pencil', Edit2: 'pencil',
  Trash2: 'trash', Trash: 'trash', Copy: 'copy', Save: 'save', Search: 'search', Filter: 'filter',
  SlidersHorizontal: 'sliders-horizontal', Sliders: 'sliders-horizontal', Settings: 'settings', Settings2: 'settings-2',
  Plug: 'plug', Unplug: 'unplug', Printer: 'printer', Archive: 'archive', Table: 'table', Table2: 'table',
  Star: 'star', Bookmark: 'bookmark', Flag: 'flag', Pin: 'pin', Lightbulb: 'lightbulb', Zap: 'zap', Sparkles: 'sparkles',
  Sun: 'sun', Moon: 'moon', Eye: 'eye', EyeOff: 'eye-off', Lock: 'lock', Unlock: 'unlock', KeyRound: 'key-round',
  MousePointerClick: 'mouse-pointer-click', ScanSearch: 'scan-search',

  // documents & communication
  FileText: 'file-text', FileSpreadsheet: 'file-spreadsheet', FileUp: 'file-up', ScrollText: 'scroll-text',
  ClipboardList: 'clipboard-list', ClipboardCheck: 'clipboard-check', StickyNote: 'sticky-note', FolderOpen: 'folder', BookOpen: 'book-open',
  Inbox: 'inbox', Send: 'send', Mail: 'mail', MailCheck: 'mail-check', MailPlus: 'mail-plus',
  MessageCircle: 'message-circle', MessageSquare: 'message-square', MessageSquareText: 'message-square-text',
  Megaphone: 'megaphone', Bell: 'bell', BellRing: 'bell-ring', Radio: 'radio',
  Phone: 'phone', PhoneCall: 'phone-call', Smartphone: 'smartphone', Camera: 'camera', Mic: 'mic',
  Gift: 'gift', Award: 'award', Trophy: 'trophy',

  // people
  User: 'user', UserRound: 'user', UserCircle: 'user', Users: 'users', UsersRound: 'users',
  UserCheck: 'user-check', UserPlus: 'user-plus', UserPlus2: 'user-plus', UserX: 'user-x', UserCog: 'user-cog',
  Handshake: 'handshake', Contact: 'contact', Briefcase: 'briefcase',

  // places & time
  Home: 'home', Building2: 'building', Factory: 'factory', Store: 'store', Warehouse: 'warehouse', Landmark: 'landmark',
  Map: 'map', MapPin: 'map-pin', MapPinned: 'map-pinned', MapPinOff: 'map-pin-off', Route: 'route', Compass: 'compass',
  Locate: 'locate', LocateFixed: 'locate', Target: 'target',
  Clock: 'clock', History: 'history', Timer: 'timer', Hourglass: 'hourglass',
  CalendarDays: 'calendar-days', Calendar: 'calendar-days', CalendarCheck: 'calendar-check', CalendarClock: 'calendar-clock',
  CalendarOff: 'calendar-off', CalendarRange: 'calendar-range', CalendarX: 'calendar-x', CheckSquare: 'check-square', SquareCheck: 'check-square',
  FlaskConical: 'flask',

  // money & commerce
  IndianRupee: 'indian-rupee', Banknote: 'banknote', Wallet: 'wallet', CreditCard: 'credit-card', Receipt: 'receipt',
  Percent: 'percent', BadgePercent: 'badge-percent', Scale: 'scale', Calculator: 'calculator', Tag: 'tag', Tags: 'tags',
  ShoppingCart: 'shopping-cart', Package: 'package', PackageCheck: 'package-check', PackagePlus: 'package-plus', PackageX: 'package-x',
  Boxes: 'boxes', Truck: 'truck', Car: 'car',

  // dashboards & charts
  LayoutGrid: 'layout-grid', LayoutDashboard: 'layout-dashboard', Kanban: 'kanban', KanbanSquare: 'kanban', Layers: 'layers',
  Network: 'network', Workflow: 'workflow', GitBranch: 'git-branch', GitMerge: 'git-merge', Activity: 'activity', Gauge: 'gauge',
  PieChart: 'pie-chart', LineChart: 'line-chart', BarChart3: 'bar-chart', TrendingUp: 'trending-up', TrendingDown: 'trending-down',
  Database: 'database', Braces: 'braces', Globe: 'globe', Languages: 'languages', Palette: 'palette', LifeBuoy: 'life-buoy',
};
