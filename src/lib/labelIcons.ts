// One vocabulary of icons for the dashboard's actions and figures, so every module draws the same glyph for the same idea
// ("Export" is always a download arrow, a ₹ figure is always the rupee sign). Buttons and stat tiles call these when they
// were not given an icon of their own; screens may also call them for their own hand-styled buttons and cards.
//
// Matching is on words, not substrings, and the first rule that matches wins, so the order below is deliberate: an
// outcome ("Won", "Overdue") outranks the thing it describes ("deals", "invoices"), and money outranks a plain count.

import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlertTriangle, Archive, ArchiveRestore, ArrowLeft, ArrowLeftRight, Ban, BarChart3, Building2, CalendarClock, CalendarDays,
  Check, CheckCircle2, CheckSquare, CircleDot, Clock, Copy, Download, Eye, FileText, Filter, GitMerge, Handshake, IndianRupee,
  Lock, LogIn, Mail, MapPin, MessageCircle, Package, Pause, Pencil, Percent, Phone, Play, Plus, Printer, Receipt, RefreshCw,
  RotateCcw, Route, Search, Send, Settings2, ShoppingCart, Sparkles, Star, Target, Timer, Trash2, Trophy, Truck, Undo2, Unlock,
  Upload, UserPlus, Users, Warehouse, XCircle,
} from 'lucide-react';

type Rule = readonly [RegExp, LucideIcon];

/** Strip a leading "+", emoji, arrows and punctuation, lower-case, collapse spaces. */
export function normaliseLabel(label: string): string {
  return label
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/^[\s+←→↑↓⟵⟶•·–—-]+/, '')
    .replace(/[…]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── actions (the first word of a button) ──────────────────────────────────────────
const ACTIONS: Rule[] = [
  [/^(add|new|create)\b/, Plus],
  [/^(export|download)\b/, Download],
  [/^(import|upload|bulk upload)\b/, Upload],
  [/^(refresh|reload|sync|re-sync)\b/, RefreshCw],
  [/^(edit|rename|modify)\b/, Pencil],
  [/^(delete|remove|discard)\b/, Trash2],
  [/^(save|update|apply|confirm|submit|done)\b/, Check],
  [/^(filter|filters)\b/, Filter],
  [/^(search|find)\b/, Search],
  [/^(send|share|broadcast|notify)\b/, Send],
  [/^print\b/, Printer],
  [/^(view|open|preview|show)\b/, Eye],
  [/^(copy|duplicate|clone)\b/, Copy],
  [/^(assign|reassign|invite)\b/, UserPlus],
  [/^(approve|accept|verify|mark as paid|mark paid)\b/, CheckCircle2],
  [/^(reject|decline|deny)\b/, XCircle],
  [/^(block|suspend|deactivate|disable)\b/, Ban],
  [/^call\b/, Phone],
  [/^(email|mail)\b/, Mail],
  [/^(whatsapp|message|chat|reply)\b/, MessageCircle],
  [/^(schedule|reschedule|book)\b/, CalendarClock],
  [/^merge\b/, GitMerge],
  [/^(unarchive|restore)\b/, ArchiveRestore],
  [/^archive\b/, Archive],
  [/^(retry|try again|reset|undo|revert|reopen)\b/, RotateCcw],
  [/^(generate|suggest|ask kini|ai)\b/, Sparkles],
  [/^back\b/, ArrowLeft],
  [/^(settings|configure|customi[sz]e)\b/, Settings2],
  [/^(log in|login|sign in)\b/, LogIn],
  [/^(start|run|resume|play)\b/, Play],
  [/^pause\b/, Pause],
  [/^unlock\b/, Unlock],
  [/^lock\b/, Lock],
  [/^convert\b/, ArrowLeftRight],
  [/^(locate|map|track)\b/, MapPin],
  [/^(report|reports)\b/, BarChart3],
];

/** The icon for a button by its label ("Add lead" → plus, "Export CSV" → download), or null when no rule fits. */
export function actionIconFor(label: string): LucideIcon | null {
  const t = normaliseLabel(label);
  if (!t) return null;
  for (const [re, icon] of ACTIONS) if (re.test(t)) return icon;
  return null;
}

// ── figures (any word of a stat tile's label) ──────────────────────────────────────
const METRICS: Rule[] = [
  // a rate is a percentage even when it names an outcome ("Win rate")
  [/\b(win rate|conversion|hit rate|strike rate)\b/, Percent],
  // outcomes first
  [/\b(won|win|wins|closed won)\b/, Trophy],
  [/\b(lost|closed lost)\b/, XCircle],
  [/\b(overdue|late|breach(es)?|delayed|at risk|expir(ed|ing)|lapsed)\b/, AlertTriangle],
  [/\b(rejected|absent|failed|cancelled|canceled|declined|disputed)\b/, XCircle],
  [/\b(approved|completed|done|resolved|present|paid|delivered|verified|closed)\b/, CheckCircle2],
  // money and rates
  [/(₹|\b(revenue|value|amount|sales|billing|billed|collection|collections|outstanding|receivables?|spend|cost|payable|balance|budget|earnings|gmv|price)\b)/, IndianRupee],
  [/(%|\b(conversion|rate|ratio|share|margin|achievement|utili[sz]ation|compliance|coverage)\b)/, Percent],
  [/\b(pending|awaiting|waiting|in review|in progress|to do|todo|queued|draft|drafts)\b/, Clock],
  // things
  [/\b(deals?|pipeline|opportunit(y|ies))\b/, Handshake],
  [/\b(leads?|prospects?|enquir(y|ies)|inquir(y|ies))\b/, UserPlus],
  [/\b(contacts?|customers?|people|users?|employees?|members?|consumers?|retailers?|executives?|reps?|team|staff|headcount)\b/, Users],
  [/\b(accounts?|compan(y|ies)|clients?|distributors?|dealers?|outlets?|stores?|branches)\b/, Building2],
  [/\b(calls?)\b/, Phone],
  [/\b(emails?|mails?)\b/, Mail],
  [/\b(whatsapp|messages?|chats?|conversations?)\b/, MessageCircle],
  [/\b(visits?|check-?ins?|locations?|geo)\b/, MapPin],
  [/\b(activit(y|ies)|tasks?|follow-?ups?|actions?)\b/, CheckSquare],
  [/\b(orders?|cart)\b/, ShoppingCart],
  [/\b(invoices?|invoiced|quotes?|quoted|bills?|billed|documents?|forms?|submissions?)\b/, FileText],
  [/\b(returns?|refunds?)\b/, Undo2],
  [/\b(dispatch(es)?|shipments?|deliver(y|ies)|vans?|trips?|loads?)\b/, Truck],
  [/\b(warehouses?)\b/, Warehouse],
  [/\b(stock|inventory|skus?|products?|items?|units?|batches?|cases?)\b/, Package],
  [/\b(claims?|expenses?|reimbursements?|receipts?|advances?)\b/, Receipt],
  [/\b(distance|km|travel|routes?|beats?)\b/, Route],
  [/\b(hours?|time|duration|minutes?|days? taken|tat|sla)\b/, Timer],
  [/\b(targets?|goals?|quotas?)\b/, Target],
  [/\b(score|rating|nps|csat)\b/, Star],
  [/\b(active|live|online|in field|on duty)\b/, Activity],
  [/\b(open)\b/, CircleDot],
  [/\b(today|this week|this month|yesterday|days?)\b/, CalendarDays],
];

/** The icon for a stat tile by its label ("Won value" → trophy, "Open deals" → handshake), or null when no rule fits. */
export function metricIconFor(label: string): LucideIcon | null {
  const t = normaliseLabel(label);
  if (!t) return null;
  for (const [re, icon] of METRICS) if (re.test(t)) return icon;
  return null;
}

/** Sizes, so icons look the same everywhere: button / inline text, stat-tile label, card title, page title tile. */
export const ICON_SIZE = { button: 15, inline: 14, stat: 15, cardTitle: 16, page: 18 } as const;
export const ICON_STROKE = 2;

