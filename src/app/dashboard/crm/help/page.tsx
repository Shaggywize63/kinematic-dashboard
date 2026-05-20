'use client';

/**
 * Help & Lifecycle — the end-to-end map of how a record moves through the
 * CRM. Mirrors the same screen on iOS (CRMHelpView) and Android
 * (CrmHelpScreen). Reps land here from the CRM sub-nav to answer "how
 * does this all fit together?" without a training session.
 */

import { useEffect, useState } from 'react';

const RED = '#E01E2C';
const BLUE = '#3E9EFF';

// Languages KINI AI understands (and the languages we have section labels
// translated into). Order matches the in-text example list elsewhere in
// the page. Stored as ISO 639-1 codes so we can extend without rewriting
// the picker.
type LangCode = 'en' | 'hi' | 'bn' | 'or' | 'as';
const LANGS: Array<{ code: LangCode; label: string; native: string }> = [
  { code: 'en', label: 'English',  native: 'English' },
  { code: 'hi', label: 'Hindi',    native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali',  native: 'বাংলা' },
  { code: 'or', label: 'Odia',     native: 'ଓଡ଼ିଆ' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
];

// Hand-translated UI surface. Keys match the canonical English copy;
// missing translations fall back to English so the page never blanks
// out. Long technical strings (KINI example prompts, the "Tool calls
// stay in English" note, etc.) intentionally aren't translated — they're
// either copy-pasted prompts or implementation details.
const T: Record<string, Partial<Record<LangCode, string>>> = {
  // ── Hero + page chrome ────────────────────────────────────────────
  'How Kinematic CRM works': {
    hi: 'Kinematic CRM कैसे काम करता है',
    bn: 'Kinematic CRM কীভাবে কাজ করে',
    or: 'Kinematic CRM କିପରି କାମ କରେ',
    as: 'Kinematic CRM কেনেকৈ কাম কৰে',
  },
  'Everything you need to ship deals — at a glance.': {
    hi: 'सौदे क्लोज़ करने के लिए जो कुछ चाहिए — एक नज़र में।',
    bn: 'ডিল বন্ধ করতে যা যা দরকার — এক নজরে।',
    or: 'ଡିଲ୍ ବନ୍ଦ କରିବାକୁ ଯାହା ସବୁ ଆବଶ୍ୟକ — ଗୋଟିଏ ନଜରରେ।',
    as: 'ডিল বন্ধ কৰিবলৈ যি লাগে — এনজৰত।',
  },
  'Display language': { hi: 'भाषा चुनें', bn: 'ভাষা নির্বাচন', or: 'ଭାଷା ବାଛନ୍ତୁ', as: 'ভাষা বাছনি' },

  // ── Section labels ────────────────────────────────────────────────
  'The lead-to-deal lifecycle': {
    hi: 'लीड से डील तक की यात्रा',
    bn: 'লিড থেকে ডিল পর্যন্ত যাত্রা',
    or: 'ଲିଡ୍‌ରୁ ଡିଲ୍ ପର୍ଯ୍ୟନ୍ତ ଯାତ୍ରା',
    as: 'লিডৰ পৰা ডিললৈ যাত্ৰা',
  },
  'From first touch to closed-won (or closed-lost).': {
    hi: 'पहले संपर्क से क्लोज़-वन (या क्लोज़-लॉस्ट) तक।',
    bn: 'প্রথম যোগাযোগ থেকে ক্লোজ-ওন (বা ক্লোজ-লস্ট) পর্যন্ত।',
    or: 'ପ୍ରଥମ ସମ୍ପର୍କରୁ କ୍ଲୋଜ୍-ୱନ୍ (କିମ୍ବା କ୍ଲୋଜ୍-ଲସ୍ଟ) ପର୍ଯ୍ୟନ୍ତ।',
    as: 'প্ৰথম সংযোগৰ পৰা ক্লোজ-ৱন (বা ক্লোজ-লস্ট) লৈকে।',
  },
  'CRM modules': { hi: 'CRM मॉड्यूल', bn: 'CRM মডিউল', or: 'CRM ମଡ୍ୟୁଲ୍', as: 'CRM মডিউল' },
  'What lives where, and when to reach for it.': {
    hi: 'क्या कहाँ है, और कब इस्तेमाल करें।',
    bn: 'কোনটি কোথায়, এবং কখন ব্যবহার করতে হবে।',
    or: 'କଣ କେଉଁଠାରେ, ଏବଂ କେବେ ବ୍ୟବହାର କରିବେ।',
    as: 'কি ক\'ত আছে, আৰু কেতিয়া ব্যৱহাৰ কৰিব।',
  },
  'Quick actions': { hi: 'त्वरित कार्य', bn: 'দ্রুত ক্রিয়া', or: 'ଶୀଘ୍ର କାର୍ଯ୍ୟ', as: 'দ্ৰুত কাৰ্য্য' },
  'The buttons on a lead/contact/deal record.': {
    hi: 'लीड/कॉन्टैक्ट/डील रिकॉर्ड पर मौजूद बटन।',
    bn: 'লিড/কন্টাক্ট/ডিল রেকর্ডে থাকা বোতাম।',
    or: 'ଲିଡ୍/କନ୍ଟାକ୍ଟ୍/ଡିଲ୍ ରେକର୍ଡରେ ଥିବା ବଟନ୍।',
    as: 'লিড/কণ্টেক্ট/ডিল ৰেকৰ্ডত থকা বুটাম।',
  },
  'Reports & analytics': { hi: 'रिपोर्ट और एनालिटिक्स', bn: 'রিপোর্ট ও অ্যানালিটিক্স', or: 'ରିପୋର୍ଟ ଓ ଆନାଲିଟିକ୍ସ', as: 'ৰিপ‌ৰ্ট আৰু এনালিটিক্স' },
  'Every report is one click away — these are the live links.': {
    hi: 'हर रिपोर्ट एक क्लिक दूर — ये लाइव लिंक हैं।',
    bn: 'প্রতিটি রিপোর্ট এক ক্লিক দূরে — এগুলো লাইভ লিঙ্ক।',
    or: 'ପ୍ରତ୍ୟେକ ରିପୋର୍ଟ ଗୋଟିଏ କ୍ଲିକରେ — ଏଗୁଡ଼ିକ ଲାଇଭ୍ ଲିଙ୍କ୍।',
    as: 'প্ৰতিটো ৰিপ‌ৰ্ট এক ক্লিক দূৰৈত — এইবোৰ লাইভ লিংক।',
  },
  '✦ KINI AI capabilities': { hi: '✦ KINI AI क्षमताएँ', bn: '✦ KINI AI ক্ষমতা', or: '✦ KINI AI କ୍ଷମତା', as: '✦ KINI AI সক্ষমতা' },
  'What the AI copilot can do for you inside the CRM.': {
    hi: 'CRM के अंदर AI कोपायलट आपके लिए क्या कर सकता है।',
    bn: 'CRM-এর ভিতরে AI কোপাইলট আপনার জন্য কী করতে পারে।',
    or: 'CRM ଭିତରେ AI କୋପାଇଲଟ୍ ଆପଣଙ୍କ ପାଇଁ କଣ କରିପାରେ।',
    as: 'CRM-ৰ ভিতৰত AI কপাইলটে আপোনাৰ বাবে কি কৰিব পাৰে।',
  },
  'Tips & tricks': { hi: 'टिप्स और ट्रिक्स', bn: 'টিপস ও কৌশল', or: 'ଟିପ୍ସ୍ ଓ କୌଶଳ', as: 'টিপ্ছ আৰু কৌশল' },
  'Small habits that save hours a week.': {
    hi: 'छोटी आदतें जो हर हफ्ते कई घंटे बचाती हैं।',
    bn: 'ছোট অভ্যাস যা সপ্তাহে কয়েক ঘণ্টা বাঁচায়।',
    or: 'ଛୋଟ ଅଭ୍ୟାସ ଯାହା ସପ୍ତାହରେ କିଛି ଘଣ୍ଟା ବଞ୍ଚାଏ।',
    as: 'সৰু অভ্যাস যিয়ে সপ্তাহত কেইঘণ্টামান ৰাহি দিয়ে।',
  },
  'Need more help?': { hi: 'और सहायता चाहिए?', bn: 'আরও সাহায্য দরকার?', or: 'ଆଉ ସାହାଯ୍ୟ ଦରକାର?', as: 'অধিক সহায় লাগে?' },
  'For anything outside this guide — onboarding, integrations setup, custom workflows, training — reach out directly. We aim to reply within one business day.': {
    hi: 'इस गाइड के बाहर किसी भी चीज़ के लिए — ऑनबोर्डिंग, इंटीग्रेशन सेटअप, कस्टम वर्कफ़्लो, ट्रेनिंग — सीधे संपर्क करें। हम एक कार्यदिवस के भीतर जवाब देने का प्रयास करते हैं।',
    bn: 'এই গাইডের বাইরের যেকোনো বিষয়ে — অনবোর্ডিং, ইন্টিগ্রেশন সেটআপ, কাস্টম ওয়ার্কফ্লো, ট্রেনিং — সরাসরি যোগাযোগ করুন। আমরা এক কার্যদিবসের মধ্যে উত্তর দেওয়ার চেষ্টা করি।',
    or: 'ଏହି ଗାଇଡ୍ ବାହାରେ ଯେକୌଣସି ବିଷୟ ପାଇଁ — ଅନ୍‌ବୋର୍ଡିଂ, ଇଣ୍ଟିଗ୍ରେସନ୍ ସେଟ୍‌ଅପ୍, କଷ୍ଟମ୍ ୱର୍କଫ୍ଲୋ, ତାଲିମ୍ — ସିଧାସଳଖ ଯୋଗାଯୋଗ କରନ୍ତୁ। ଆମେ ଗୋଟିଏ କାର୍ଯ୍ୟଦିବସ ମଧ୍ୟରେ ଉତ୍ତର ଦେବାକୁ ଚେଷ୍ଟା କରୁ।',
    as: 'এই গাইডৰ বাহিৰৰ যিকোনো বিষয়ৰ বাবে — অনবৰ্ডিং, ইণ্টিগ্ৰেছন ছেটআপ, কাষ্টম ৱৰ্কফ্ল\', প্ৰশিক্ষণ — পোনপটীয়াকৈ যোগাযোগ কৰক। আমি এটা কাৰ্য্যদিৱসৰ ভিতৰত উত্তৰ দিবলৈ চেষ্টা কৰোঁ।',
  },
  'Call':       { hi: 'कॉल',      bn: 'কল',         or: 'କଲ୍',         as: 'কল' },
  'Email':      { hi: 'ईमेल',     bn: 'ইমেইল',      or: 'ଇମେଲ୍',       as: 'ইমেইল' },
  'WhatsApp':   { hi: 'WhatsApp', bn: 'WhatsApp',  or: 'WhatsApp',  as: 'WhatsApp' },

  // ── Lifecycle intro paragraphs ───────────────────────────────────
  'Every lead in Kinematic moves through a small set of statuses. Reps don’t do paperwork — they just keep the record honest by flipping the status as the relationship progresses, and the rest of the CRM (analytics, win-rate, forecasts, automations) reacts on its own.': {
    hi: 'Kinematic में हर लीड कुछ स्टेटसों से गुज़रती है। रेप्स को कागज़ी काम नहीं करना — रिश्ता आगे बढ़ने पर बस स्टेटस बदलते जाएँ, और बाक़ी CRM (एनालिटिक्स, विन-रेट, फ़ोरकास्ट, ऑटोमेशन) अपने आप रिएक्ट करता है।',
    bn: 'Kinematic-এ প্রতিটি লিড কয়েকটি স্ট্যাটাসের মধ্য দিয়ে যায়। রেপ-দের কাগজপত্র করতে হয় না — সম্পর্ক এগোনোর সাথে সাথে শুধু স্ট্যাটাস পাল্টে দিন, বাকি CRM (অ্যানালিটিক্স, উইন-রেট, ফোরকাস্ট, অটোমেশন) নিজে থেকেই প্রতিক্রিয়া দেয়।',
    or: 'Kinematic ର ପ୍ରତ୍ୟେକ ଲିଡ୍ କିଛି ଷ୍ଟାଟସ୍ ଦେଇ ଯାଏ। ରେପ୍‌ମାନଙ୍କୁ କାଗଜପତ୍ର କରିବାକୁ ପଡେ ନାହିଁ — ସମ୍ପର୍କ ଆଗକୁ ବଢିବା ସହିତ ଷ୍ଟାଟସ୍ ବଦଳାଇ ଚାଲନ୍ତୁ, ବାକି CRM (ଆନାଲିଟିକ୍ସ, ୱିନ୍-ରେଟ୍, ଫୋରକାଷ୍ଟ୍, ଅଟୋମେସନ୍) ନିଜେ ପ୍ରତିକ୍ରିୟା ଦିଏ।',
    as: 'Kinematic-ত প্ৰতিটো লিড কেইটামান ষ্টেটাছৰ মাজেৰে যায়। ৰেপসকলে কাগজৰ কাম কৰিব নালাগে — সম্পৰ্ক আগবঢ়াৰ লগে লগে কেৱল ষ্টেটাছ সলনি কৰি যাওক, বাকী CRM (এনালিটিক্স, ৱিন-ৰেট, ফ\'ৰকাষ্ট, অট\'মেচন) নিজাববীয়াকৈ সঁহাৰি দিয়ে।',
  },

  // ── STAGE titles + details ───────────────────────────────────────
  'Lead arrives':  { hi: 'लीड आती है',  bn: 'লিড আসে',     or: 'ଲିଡ୍ ଆସେ',     as: 'লিড আহে' },
  'Qualify':       { hi: 'क्वालिफ़ाई',    bn: 'কোয়ালিফাই',   or: 'କ୍ୱାଲିଫାଇ',     as: 'কোৱালিফাই' },
  'Convert':       { hi: 'कन्वर्ट',       bn: 'কনভার্ট',      or: 'କନଭର୍ଟ',        as: 'কনভাৰ্ট' },
  'Move the deal': { hi: 'डील आगे बढ़ाएँ', bn: 'ডিল এগিয়ে নিন', or: 'ଡିଲ୍ ଆଗକୁ ବଢ଼ାନ୍ତୁ', as: 'ডিল আগবঢ়াওক' },
  'Close':         { hi: 'क्लोज़',         bn: 'ক্লোজ',         or: 'କ୍ଲୋଜ୍',          as: 'ক্লোজ' },

  'From a web form, lead-source integration (Meta/Google/Zoho), CSV import, KINI AI auto-capture, or a rep typing it in. Status starts as NEW; dedup runs immediately on phone+email so the same person never lands twice.': {
    hi: 'वेब फ़ॉर्म, लीड-सोर्स इंटीग्रेशन (Meta/Google/Zoho), CSV इम्पोर्ट, KINI AI ऑटो-कैप्चर, या रेप के मैन्युअल टाइप से। स्टेटस NEW से शुरू होता है; फ़ोन+ईमेल पर तुरंत डीडुप चलता है ताकि एक ही व्यक्ति दो बार न आए।',
    bn: 'ওয়েব ফর্ম, লিড-সোর্স ইন্টিগ্রেশন (Meta/Google/Zoho), CSV ইমপোর্ট, KINI AI অটো-ক্যাপচার, বা রেপের টাইপ করা। স্ট্যাটাস NEW দিয়ে শুরু; ফোন+ইমেইলে সাথে সাথে ডিডাপ চলে যাতে একই ব্যক্তি দুবার না আসে।',
    or: 'ୱେବ୍ ଫର୍ମ, ଲିଡ୍-ସୋର୍ସ ଇଣ୍ଟିଗ୍ରେସନ୍ (Meta/Google/Zoho), CSV ଇମ୍ପୋର୍ଟ୍, KINI AI ଅଟୋ-କ୍ୟାପଚର୍, କିମ୍ବା ରେପ୍ ଟାଇପ୍ କରି। ଷ୍ଟାଟସ୍ NEW ଭାବେ ଆରମ୍ଭ ହୁଏ; ଫୋନ୍+ଇମେଲରେ ତୁରନ୍ତ ଡିଡୁପ୍ ଚାଲେ ଯେପରି ସମାନ ବ୍ୟକ୍ତି ଦୁଇଥର ନ ଆସେ।',
    as: 'ৱেব ফৰ্ম, লিড-ছ\'ৰ্ছ ইণ্টিগ্ৰেছন (Meta/Google/Zoho), CSV ইম্পোৰ্ট, KINI AI অট\'-কেপচাৰ, বা ৰেপৰ টাইপ কৰা। ষ্টেটাছ NEW-ৰ পৰা আৰম্ভ; ফোন+ইমেইলত লগে লগে ডিডাপ চলে যাতে একেজন ব্যক্তি দুবাৰ নাহে।',
  },
  'Call, WhatsApp or meet the lead. Move status NEW → WORKING → NURTURING → QUALIFIED. The AI score (0-100) and Lead Score Distribution chart help prioritise — focus on 70+.': {
    hi: 'लीड को कॉल करें, WhatsApp भेजें या मिलें। स्टेटस NEW → WORKING → NURTURING → QUALIFIED करें। AI स्कोर (0-100) और लीड स्कोर डिस्ट्रिब्यूशन चार्ट प्राथमिकता तय करने में मदद करते हैं — 70+ पर ध्यान दें।',
    bn: 'লিডকে কল করুন, WhatsApp করুন বা সাক্ষাৎ করুন। স্ট্যাটাস NEW → WORKING → NURTURING → QUALIFIED করুন। AI স্কোর (0-100) এবং লিড স্কোর ডিস্ট্রিবিউশন চার্ট অগ্রাধিকার ঠিক করতে সাহায্য করে — 70+ এ মনোযোগ দিন।',
    or: 'ଲିଡ୍‌କୁ କଲ୍ କରନ୍ତୁ, WhatsApp କରନ୍ତୁ କିମ୍ବା ଭେଟନ୍ତୁ। ଷ୍ଟାଟସ୍ NEW → WORKING → NURTURING → QUALIFIED କରନ୍ତୁ। AI ସ୍କୋର (0-100) ଏବଂ ଲିଡ୍ ସ୍କୋର ଡିଷ୍ଟ୍ରିବ୍ୟୁସନ୍ ଚାର୍ଟ ପ୍ରାଥମିକତା ସ୍ଥିର କରିବାରେ ସାହାଯ୍ୟ କରେ — 70+ ଉପରେ ଧ୍ୟାନ ଦିଅନ୍ତୁ।',
    as: 'লিডক কল কৰক, WhatsApp কৰক বা সাক্ষাৎ কৰক। ষ্টেটাছ NEW → WORKING → NURTURING → QUALIFIED কৰক। AI স্ক\'ৰ (0-100) আৰু লিড স্ক\'ৰ ডিষ্ট্ৰিবিউচন চাৰ্টে অগ্ৰাধিকাৰ স্থিৰ কৰাত সহায় কৰে — 70+ত মনোযোগ দিয়ক।',
  },
  'Tap Convert. The deal name is pre-filled from the lead so you can edit it in one tap. Kinematic spins up a Contact, Account (B2B only), and a Deal placed on your default pipeline. You land straight on the new Deal page.': {
    hi: 'Convert पर टैप करें। डील का नाम लीड से प्री-फ़िल हो जाता है, एक टैप में बदल सकते हैं। Kinematic एक Contact, Account (केवल B2B), और आपकी डिफ़ॉल्ट पाइपलाइन पर एक Deal बनाता है। आप सीधे नई Deal पेज पर पहुँचते हैं।',
    bn: 'Convert-এ ট্যাপ করুন। ডিলের নাম লিড থেকে প্রি-ফিল হয়ে যায়, এক ট্যাপে সম্পাদনা করা যায়। Kinematic একটি Contact, Account (শুধু B2B), এবং আপনার ডিফল্ট পাইপলাইনে একটি Deal তৈরি করে। আপনি সরাসরি নতুন Deal পেজে পৌঁছান।',
    or: 'Convert ଉପରେ ଟ୍ୟାପ୍ କରନ୍ତୁ। ଡିଲ୍‌ର ନାମ ଲିଡ୍‌ରୁ ପ୍ରୀ-ଫିଲ୍ ହୋଇଯାଏ, ଗୋଟିଏ ଟ୍ୟାପ୍‌ରେ ସମ୍ପାଦନା କରିହେବ। Kinematic ଗୋଟିଏ Contact, Account (କେବଳ B2B), ଏବଂ ଆପଣଙ୍କ ଡିଫଲ୍ଟ ପାଇପ୍‌ଲାଇନ୍‌ରେ ଗୋଟିଏ Deal ସୃଷ୍ଟି କରେ। ଆପଣ ସିଧାସଳଖ ନୂଆ Deal ପୃଷ୍ଠାରେ ପହଞ୍ଚନ୍ତି।',
    as: 'Convert-ত টেপ কৰক। ডিলৰ নাম লিডৰ পৰা প্ৰি-ফিল হৈ যায়, এটা টেপতে সম্পাদনা কৰিব পাৰি। Kinematic-এ এটা Contact, Account (কেৱল B2B), আৰু আপোনাৰ ডিফল্ট পাইপলাইনত এটা Deal সৃষ্টি কৰে। আপুনি পোনে পোনে নতুন Deal পৃষ্ঠালৈ যায়।',
  },
  'On the Deal detail, an inline stage stepper shows your progress — blue is current, green ticks are past, grey is upcoming. Tap any stage to jump, or hit ✓ Mark Complete to advance one step. Win Probability + Next-Best-Action refresh from KINI AI as you go. Prefer a board view? Switch the Deals page to ▦ Kanban and drag deals between columns.': {
    hi: 'Deal detail पर एक इनलाइन स्टेज स्टेपर आपकी प्रगति दिखाता है — नीला अभी का, हरे टिक पिछले, ग्रे आगे आने वाले। किसी भी स्टेज पर टैप करें, या ✓ Mark Complete दबाएँ। Win Probability + Next-Best-Action KINI AI से अपडेट होते रहते हैं। बोर्ड व्यू चाहिए? Deals पेज पर ▦ Kanban में बदलें।',
    bn: 'Deal detail-এ একটি ইনলাইন স্টেজ স্টেপার আপনার অগ্রগতি দেখায় — নীল মানে এখনকার, সবুজ টিক মানে অতীত, ধূসর মানে আসন্ন। যেকোনো স্টেজে ট্যাপ করুন, বা ✓ Mark Complete-এ ক্লিক করুন। Win Probability + Next-Best-Action KINI AI থেকে আপডেট হতে থাকে। বোর্ড ভিউ চান? Deals পেজে ▦ Kanban-এ যান।',
    or: 'Deal detail ଉପରେ ଏକ ଇନ୍‌ଲାଇନ୍ ଷ୍ଟେଜ୍ ଷ୍ଟେପର୍ ଆପଣଙ୍କ ପ୍ରଗତି ଦେଖାଏ — ନୀଳ ଅଭି, ସବୁଜ ଟିକ୍ ପୂର୍ବ, ଧୂସର ଆଗକୁ। ଯେକୌଣସି ଷ୍ଟେଜ୍ ଉପରେ ଟ୍ୟାପ୍ କରନ୍ତୁ, କିମ୍ବା ✓ Mark Complete ଦବାନ୍ତୁ। Win Probability + Next-Best-Action KINI AI ରୁ ଅଦ୍ୟତିତ ହୁଏ। ବୋର୍ଡ୍ ଭ୍ୟୁ ଚାହାନ୍ତି? Deals ପୃଷ୍ଠାରେ ▦ Kanban ବଦଳାନ୍ତୁ।',
    as: 'Deal detail-ত এটা ইনলাইন ষ্টেজ ষ্টেপাৰে আপোনাৰ অগ্ৰগতি দেখুৱায় — নীলা এতিয়াৰ, সেউজীয়া টিক অতীতৰ, ধূসৰ অহাৰ। যিকোনো ষ্টেজত টেপ কৰক, বা ✓ Mark Complete টিপক। Win Probability + Next-Best-Action KINI AI-ৰ পৰা আপডেট হয়। ব\'ৰ্ড ভিউ লাগে? Deals পৃষ্ঠাত ▦ Kanban-লৈ যাওক।',
  },
  'Mark Won (with amount + close date) or Lost (with reason + competitor). Won deals add to revenue charts and Forecast; lost reasons feed Win/Loss + Lost Reasons analytics.': {
    hi: 'Won मार्क करें (राशि + क्लोज़ डेट के साथ) या Lost (कारण + प्रतिस्पर्धी के साथ)। जीती हुई डील्स रेवेन्यू चार्ट + Forecast में जुड़ती हैं; खोने के कारण Win/Loss + Lost Reasons एनालिटिक्स में जाते हैं।',
    bn: 'Won মার্ক করুন (পরিমাণ + ক্লোজ ডেট সহ) বা Lost (কারণ + প্রতিযোগী সহ)। জেতা ডিল রেভিনিউ চার্ট + Forecast-এ যোগ হয়; হারানোর কারণ Win/Loss + Lost Reasons অ্যানালিটিক্সে যায়।',
    or: 'Won ମାର୍କ କରନ୍ତୁ (ରାଶି + କ୍ଲୋଜ୍ ତାରିଖ ସହିତ) କିମ୍ବା Lost (କାରଣ + ପ୍ରତିଯୋଗୀ ସହିତ)। ଜିତା ଡିଲ୍ ରେଭିନ୍ୟୁ ଚାର୍ଟ + Forecast ରେ ଯୋଗ ହୁଏ; ହାରିବାର କାରଣ Win/Loss + Lost Reasons ଆନାଲିଟିକ୍ସ‌କୁ ଯାଏ।',
    as: 'Won মাৰ্ক কৰক (পৰিমাণ + ক্লোজ তাৰিখৰ সৈতে) বা Lost (কাৰণ + প্ৰতিদ্বন্দ্বীৰ সৈতে)। জিকা ডিলবোৰ ৰাজহ চাৰ্ট + Forecast-ত যোগ হয়; হাৰাৰ কাৰণবোৰ Win/Loss + Lost Reasons এনালিটিক্সলৈ যায়।',
  },

  // ── MODULES (title + what + when) ─────────────────────────────────
  'Dashboard (Overview)': { hi: 'डैशबोर्ड (ओवरव्यू)', bn: 'ড্যাশবোর্ড (ওভারভিউ)', or: 'ଡ୍ୟାସବୋର୍ଡ (ଓଭରଭିଉ)', as: 'ডেছব\'ৰ্ড (ওভাৰভিউ)' },
  'Stat cards (open pipeline, win rate, avg deal), the geo-map of leads, and your pinned analytics widgets.': {
    hi: 'स्टैट कार्ड (ओपन पाइपलाइन, विन रेट, औसत डील), लीड्स का जियो-मैप, और आपके पिन किए गए एनालिटिक्स विजेट।',
    bn: 'স্ট্যাট কার্ড (ওপেন পাইপলাইন, উইন রেট, গড় ডিল), লিডের জিও-ম্যাপ, এবং আপনার পিন করা অ্যানালিটিক্স উইজেট।',
    or: 'ଷ୍ଟାଟ କାର୍ଡ (ଓପନ୍ ପାଇପ୍‌ଲାଇନ୍, ୱିନ୍ ରେଟ୍, ହାରାହାରି ଡିଲ୍), ଲିଡ୍‌ର ଜିଓ-ମ୍ୟାପ, ଏବଂ ଆପଣଙ୍କ ପିନ୍ କରାଯାଇଥିବା ଆନାଲିଟିକ୍ସ ୱିଜେଟ୍।',
    as: 'ষ্টেট কাৰ্ড (ওপেন পাইপলাইন, ৱিন ৰেট, গড় ডিল), লিডসমূহৰ জিঅ\'-মেপ, আৰু আপোনাৰ পিন কৰা এনালিটিক্স উইজেট।',
  },
  'Use it when you start your day to see what changed overnight.': {
    hi: 'दिन शुरू करते समय इस्तेमाल करें — रात भर में क्या बदला, देखने के लिए।',
    bn: 'দিন শুরুর সময় ব্যবহার করুন — রাতে কী বদলেছে দেখতে।',
    or: 'ଦିନ ଆରମ୍ଭ ସମୟରେ ବ୍ୟବହାର କରନ୍ତୁ — ରାତିରେ କଣ ବଦଳିଲା ଦେଖିବାକୁ।',
    as: 'দিন আৰম্ভ কৰোঁতে ব্যৱহাৰ কৰক — ৰাতিৰ ভিতৰত কি সলনি হ\'ল চাবলৈ।',
  },
  'Leads': { hi: 'लीड्स', bn: 'লিড', or: 'ଲିଡ୍ସ', as: 'লিড' },
  'Full list with filters (status, source, owner, score, state/city/district), AI score badges, bulk-assign, CSV import. Lead detail layout is fully responsive — read it on a phone in the car between meetings.': {
    hi: 'फ़िल्टर (स्टेटस, सोर्स, ओनर, स्कोर, राज्य/शहर/ज़िला), AI स्कोर बैज, बल्क-असाइन, CSV इम्पोर्ट के साथ पूरी सूची। लीड डिटेल लेआउट पूरी तरह रिस्पॉन्सिव है — मीटिंगों के बीच गाड़ी में फ़ोन पर भी पढ़ सकते हैं।',
    bn: 'ফিল্টার (স্ট্যাটাস, সোর্স, ওনার, স্কোর, রাজ্য/শহর/জেলা), AI স্কোর ব্যাজ, বাল্ক-অ্যাসাইন, CSV ইমপোর্ট সহ সম্পূর্ণ তালিকা। লিড ডিটেইল লেআউট সম্পূর্ণ রেসপন্সিভ — মিটিংয়ের মাঝে গাড়িতে ফোনেও পড়া যায়।',
    or: 'ଫିଲ୍ଟର (ଷ୍ଟାଟସ୍, ସୋର୍ସ, ଓନର, ସ୍କୋର, ରାଜ୍ୟ/ସହର/ଜିଲ୍ଲା), AI ସ୍କୋର ବ୍ୟାଜ୍, ବଲ୍କ-ଆସାଇନ୍, CSV ଇମ୍ପୋର୍ଟ ସହିତ ସମ୍ପୂର୍ଣ୍ଣ ତାଲିକା। ଲିଡ୍ ବିବରଣୀ ଲେଆଉଟ୍ ସମ୍ପୂର୍ଣ୍ଣ ରେସ୍ପନ୍‌ସିଭ୍।',
    as: 'ফিল্টাৰ (ষ্টেটাছ, ছ\'ৰ্ছ, ওনাৰ, স্ক\'ৰ, ৰাজ্য/চহৰ/জিলা), AI স্ক\'ৰ বেজ, বাল্ক-এছাইন, CSV ইম্পৰ্ট থকা সম্পূৰ্ণ তালিকা। লিড বিৱৰণ লেআউট সম্পূৰ্ণ ৰিস্পন্সিভ — মিটিঙৰ মাজত গাড়ীত ফোনতো পঢ়িব পাৰি।',
  },
  'Use it when you need to slice prospects — "show me leads stuck more than 7 days in Mumbai".': {
    hi: 'जब आपको प्रॉस्पेक्ट छाँटने हों इस्तेमाल करें — "मुंबई में 7 दिन से ज़्यादा रुकी लीड्स दिखाओ"।',
    bn: 'যখন প্রসপেক্ট আলাদা করতে হবে তখন ব্যবহার করুন — "মুম্বাইয়ে 7 দিনের বেশি আটকে থাকা লিড দেখান"।',
    or: 'ଯେତେବେଳେ ପ୍ରସ୍ପେକ୍ଟ ବାଛିବାକୁ ହେବ ସେତେବେଳେ ବ୍ୟବହାର କରନ୍ତୁ — "ମୁମ୍ବାଇରେ 7 ଦିନରୁ ଅଧିକ ଅଟକି ଥିବା ଲିଡ୍ ଦେଖାନ୍ତୁ"।',
    as: 'যেতিয়া প্ৰছপেক্ট বাছিব লাগে তেতিয়া ব্যৱহাৰ কৰক — "মুম্বাইত 7 দিনৰ অধিক আবদ্ধ হৈ থকা লিড দেখুৱাওক"।',
  },
  'Lead Analytics': { hi: 'लीड एनालिटिक्स', bn: 'লিড অ্যানালিটিক্স', or: 'ଲିଡ୍ ଆନାଲିଟିକ୍ସ', as: 'লিড এনালিটিক্স' },
  'Customisable widget grid: lead velocity, time-to-first-touch, stuck leads, cohort conversion, score-band conversion, territory map. Pin any widget to your Overview.': {
    hi: 'कस्टमाइज़ेबल विजेट ग्रिड: लीड वेलोसिटी, टाइम-टू-फ़र्स्ट-टच, स्टक लीड्स, कोहोर्ट कन्वर्ज़न, स्कोर-बैंड कन्वर्ज़न, टेरिटरी मैप। किसी भी विजेट को Overview पर पिन करें।',
    bn: 'কাস্টমাইজযোগ্য উইজেট গ্রিড: লিড ভেলোসিটি, টাইম-টু-ফার্স্ট-টাচ, স্টাক লিড, কোহর্ট কনভার্শন, স্কোর-ব্যান্ড কনভার্শন, টেরিটরি ম্যাপ। যেকোনো উইজেট Overview-এ পিন করুন।',
    or: 'କଷ୍ଟମାଇଜେବଲ୍ ୱିଜେଟ୍ ଗ୍ରିଡ୍: ଲିଡ୍ ଭେଲୋସିଟି, ଟାଇମ୍-ଟୁ-ଫର୍ଷ୍ଟ-ଟଚ୍, ଷ୍ଟକ୍ ଲିଡ୍, କୋହର୍ଟ କନଭର୍ସନ୍, ସ୍କୋର-ବ୍ୟାଣ୍ଡ କନଭର୍ସନ୍, ଟେରିଟୋରୀ ମ୍ୟାପ୍।',
    as: 'কাষ্টমাইজযোগ্য উইজেট গ্ৰিড: লিড ভেলোচিটি, টাইম-টু-ফাৰ্ষ্ট-টাচ, ষ্টাক লিড, ক\'হ\'ৰ্ট কনভাৰ্ছন, স্ক\'ৰ-বেণ্ড কনভাৰ্ছন, টেৰিটৰি মেপ।',
  },
  'Use it weekly to see where the funnel is leaking.': {
    hi: 'साप्ताहिक इस्तेमाल करें ताकि देख सकें फ़नल कहाँ लीक हो रहा है।',
    bn: 'সাপ্তাহিকভাবে ব্যবহার করুন — ফানেল কোথায় ফাঁস হচ্ছে দেখতে।',
    or: 'ସାପ୍ତାହିକ ବ୍ୟବହାର କରନ୍ତୁ — ଫନେଲ୍ କେଉଁଠାରେ ଲିକ୍ ହେଉଛି ଦେଖିବାକୁ।',
    as: 'সপ্তাহত এবাৰ ব্যৱহাৰ কৰক — ফানেলটো ক\'ত লিক হৈছে চাবলৈ।',
  },
  'Contacts': { hi: 'कॉन्टैक्ट्स', bn: 'কন্টাক্ট', or: 'କଣ୍ଟାକ୍ଟ୍', as: 'কন্টেক্ট' },
  'Your people directory. B2C contacts carry consent + loyalty tier; B2B contacts link to an Account.': {
    hi: 'आपकी पीपल डायरेक्टरी। B2C कॉन्टैक्ट्स में सहमति + लॉयल्टी टियर होती है; B2B कॉन्टैक्ट्स एक Account से जुड़ते हैं।',
    bn: 'আপনার মানুষের ডিরেক্টরি। B2C কন্টাক্টে সম্মতি + লয়্যালটি টিয়ার থাকে; B2B কন্টাক্ট একটি Account-এর সাথে যুক্ত।',
    or: 'ଆପଣଙ୍କ ଲୋକଙ୍କ ଡାଇରେକ୍ଟୋରୀ। B2C କଣ୍ଟାକ୍ଟରେ ସମ୍ମତି + ଲୟାଲ୍ଟି ଟିଅର୍ ଥାଏ; B2B କଣ୍ଟାକ୍ଟ ଗୋଟିଏ Account ସହିତ ସଂଯୁକ୍ତ।',
    as: 'আপোনাৰ মানুহৰ ডাইৰেক্টৰী। B2C কন্টেক্টত সন্মতি + লয়েল্টি টিয়াৰ থাকে; B2B কন্টেক্ট এটা Account-ৰ সৈতে সংযুক্ত।',
  },
  'Use it to manage individuals across multiple deals or repeat customers.': {
    hi: 'कई डील्स या रिपीट कस्टमर्स में व्यक्तियों को मैनेज करने के लिए इस्तेमाल करें।',
    bn: 'একাধিক ডিল বা রিপিট গ্রাহকদের মধ্যে ব্যক্তিদের পরিচালনা করতে ব্যবহার করুন।',
    or: 'ଏକାଧିକ ଡିଲ୍ କିମ୍ବା ରିପିଟ୍ କଷ୍ଟମର୍‌ମାନଙ୍କ ମଧ୍ୟରେ ବ୍ୟକ୍ତିଙ୍କୁ ପରିଚାଳନା କରିବାକୁ ବ୍ୟବହାର କରନ୍ତୁ।',
    as: 'একাধিক ডিল বা ৰিপিট গ্ৰাহকৰ মাজত ব্যক্তিসকলক পৰিচালনা কৰিবলৈ ব্যৱহাৰ কৰক।',
  },
  'Accounts': { hi: 'अकाउंट्स', bn: 'অ্যাকাউন্ট', or: 'ଆକାଉଣ୍ଟ୍', as: 'একাউণ্ট' },
  'Company records that group contacts + deals together. Industry, revenue, domain, owner.': {
    hi: 'कंपनी रिकॉर्ड्स जो कॉन्टैक्ट्स + डील्स को एक साथ ग्रुप करते हैं। इंडस्ट्री, रेवेन्यू, डोमेन, ओनर।',
    bn: 'কোম্পানি রেকর্ড যা কন্টাক্ট + ডিলগুলোকে একসাথে গ্রুপ করে। ইন্ডাস্ট্রি, রেভিনিউ, ডোমেইন, ওনার।',
    or: 'କମ୍ପାନୀ ରେକର୍ଡ ଯାହା କଣ୍ଟାକ୍ଟ୍ + ଡିଲ୍‌ଗୁଡ଼ିକୁ ଏକାଠି ଗ୍ରୁପ୍ କରେ। ଇଣ୍ଡଷ୍ଟ୍ରୀ, ରେଭିନ୍ୟୁ, ଡୋମେନ୍, ଓନର।',
    as: 'কোম্পানী ৰেকৰ্ড যিয়ে কন্টেক্ট + ডিলবোৰক একেলগে গোট কৰে। ইণ্ডাষ্ট্ৰী, ৰাজহ, ড\'মেইন, ওনাৰ।',
  },
  'B2B sellers: this is the canonical "who is the buying organisation" view.': {
    hi: 'B2B विक्रेताओं के लिए: यह "खरीदने वाली संस्था कौन है" का प्रामाणिक व्यू है।',
    bn: 'B2B বিক্রেতাদের জন্য: এটা "কে কিনছে" সংস্থার আদর্শ ভিউ।',
    or: 'B2B ବିକ୍ରେତାଙ୍କ ପାଇଁ: ଏହା "କିଣୁଥିବା ସଂସ୍ଥା କିଏ" ର ପ୍ରାମାଣିକ ଭ୍ୟୁ।',
    as: 'B2B বিক্ৰেতাসকলৰ বাবে: এইটো "ক\'ন কিনিছে" সংস্থাৰ প্ৰামাণিক ভিউ।',
  },
  'Deals': { hi: 'डील्स', bn: 'ডিল', or: 'ଡିଲ୍ସ', as: 'ডিল' },
  'Open opportunities with stage, amount, probability, expected close date, line items. Toggle ☰ List ⇄ ▦ Kanban from the header — kanban filters by pipeline so you can drag deals between stages.': {
    hi: 'ओपन ऑपर्च्युनिटीज़ — स्टेज, राशि, प्रोबेबिलिटी, अपेक्षित क्लोज़ डेट, लाइन आइटम के साथ। हेडर से ☰ List ⇄ ▦ Kanban टॉगल करें।',
    bn: 'ওপেন সুযোগ — স্টেজ, পরিমাণ, প্রোবাবিলিটি, প্রত্যাশিত ক্লোজ ডেট, লাইন আইটেম সহ। হেডার থেকে ☰ List ⇄ ▦ Kanban টগল করুন।',
    or: 'ଓପନ୍ ସୁଯୋଗ — ଷ୍ଟେଜ୍, ରାଶି, ପ୍ରୋବାବିଲିଟି, ପ୍ରତ୍ୟାଶିତ କ୍ଲୋଜ୍ ତାରିଖ, ଲାଇନ୍ ଆଇଟମ୍ ସହିତ।',
    as: 'ওপেন সুযোগ — ষ্টেজ, পৰিমাণ, প্ৰ\'বেবিলিটি, প্ৰত্যাশিত ক্লোজ তাৰিখ, লাইন আইটেমৰ সৈতে।',
  },
  'Use it to see your active pipeline. Switch to Kanban on Monday morning to triage; stay on List for bulk edits and filters.': {
    hi: 'अपनी सक्रिय पाइपलाइन देखने के लिए इस्तेमाल करें। सोमवार सुबह Kanban में जाएँ; बल्क एडिट + फ़िल्टर के लिए List पर रहें।',
    bn: 'আপনার সক্রিয় পাইপলাইন দেখতে ব্যবহার করুন। সোমবার সকালে Kanban-এ যান; বাল্ক এডিট + ফিল্টারের জন্য List-এ থাকুন।',
    or: 'ଆପଣଙ୍କ ସକ୍ରିୟ ପାଇପ୍‌ଲାଇନ୍ ଦେଖିବାକୁ ବ୍ୟବହାର କରନ୍ତୁ। ସୋମବାର ସକାଳେ Kanban‌କୁ ଯାଆନ୍ତୁ; ବଲ୍କ୍ ଏଡିଟ୍ + ଫିଲ୍ଟର ପାଇଁ List ରେ ରୁହନ୍ତୁ।',
    as: 'আপোনাৰ সক্ৰিয় পাইপলাইন চাবলৈ ব্যৱহাৰ কৰক। সোমবাৰে ৰাতিপুৱা Kanban-লৈ যাওক; বাল্ক এডিট আৰু ফিল্টাৰৰ বাবে List-ত থাকক।',
  },
  'Pipeline': { hi: 'पाइपलाइन', bn: 'পাইপলাইন', or: 'ପାଇପ୍‌ଲାଇନ୍', as: 'পাইপলাইন' },
  'Directory of pipelines (Enterprise, SMB, Channel etc.). Each row shows stages, open-deal count + total value. + New Pipeline lets you create the pipeline AND its stages (Open / Won / Lost, colour-coded) in one modal — no separate Settings trip.': {
    hi: 'पाइपलाइनों की डायरेक्टरी (Enterprise, SMB, Channel आदि)। हर पंक्ति में स्टेजेस, ओपन डील काउंट + कुल वैल्यू। + New Pipeline से पाइपलाइन और स्टेजेस एक ही जगह बनाएँ।',
    bn: 'পাইপলাইনের ডিরেক্টরি (Enterprise, SMB, Channel ইত্যাদি)। প্রতিটি সারিতে স্টেজ, ওপেন ডিল কাউন্ট + মোট মূল্য। + New Pipeline দিয়ে এক জায়গায় পাইপলাইন + স্টেজ তৈরি করুন।',
    or: 'ପାଇପ୍‌ଲାଇନ୍‌ଗୁଡ଼ିକର ଡାଇରେକ୍ଟୋରୀ। ପ୍ରତ୍ୟେକ ଧାଡ଼ିରେ ଷ୍ଟେଜ୍, ଓପନ୍ ଡିଲ୍ ସଂଖ୍ୟା + ମୋଟ ମୂଲ୍ୟ।',
    as: 'পাইপলাইনৰ ডাইৰেক্টৰী। প্ৰতিটো শাৰীত ষ্টেজ, ওপেন ডিল গণনা + মুঠ মূল্য।',
  },
  'Use it when you set up a new sales motion or want a high-level "what pipelines exist?" view. Kanban view of any pipeline → its row → Kanban →.': {
    hi: 'नई सेल्स मोशन सेटअप करते समय या "कौन सी पाइपलाइनें मौजूद हैं" का व्यू चाहिए तब इस्तेमाल करें।',
    bn: 'নতুন সেলস মোশন সেটআপ করার সময় বা "কোন পাইপলাইন আছে" দেখতে ব্যবহার করুন।',
    or: 'ନୂଆ ସେଲ୍ସ ମୋସନ୍ ସେଟ୍‌ଅପ୍ କରିବାବେଳେ ବ୍ୟବହାର କରନ୍ତୁ।',
    as: 'নতুন চেলছ মোচন ছেটআপ কৰোঁতে ব্যৱহাৰ কৰক।',
  },
  'Products': { hi: 'प्रोडक्ट्स', bn: 'প্রোডাক্ট', or: 'ପ୍ରଡକ୍ଟ୍', as: 'প্ৰডাক্ট' },
  'SKU catalogue with price, weight, GST rate, category. Deals reference products via line items.': {
    hi: 'SKU कैटलॉग — दाम, वज़न, GST रेट, श्रेणी के साथ। डील्स लाइन आइटम्स के ज़रिए प्रोडक्ट्स को रेफ़र करती हैं।',
    bn: 'SKU ক্যাটালগ — দাম, ওজন, GST রেট, ক্যাটাগরি সহ। ডিল লাইন আইটেমের মাধ্যমে প্রোডাক্ট রেফার করে।',
    or: 'SKU କ୍ୟାଟାଲଗ୍ — ଦାମ, ଓଜନ, GST ରେଟ୍, ବର୍ଗ ସହିତ।',
    as: 'SKU কেটাল\'গ — দাম, ওজন, GST ৰেট, শ্ৰেণীৰ সৈতে।',
  },
  'Set up once when you onboard; touch when prices change.': {
    hi: 'ऑनबोर्ड के समय एक बार सेट करें; क़ीमतें बदलने पर अपडेट करें।',
    bn: 'অনবোর্ডিংয়ের সময় একবার সেট করুন; দাম বদলালে আপডেট করুন।',
    or: 'ଅନ୍‌ବୋର୍ଡ ସମୟରେ ଥରେ ସେଟ୍ କରନ୍ତୁ; ଦାମ ବଦଳିଲେ ଅଦ୍ୟତିତ କରନ୍ତୁ।',
    as: 'অনবৰ্ডিঙৰ সময়ত এবাৰ ছেট কৰক; দাম সলনি হ\'লে আপডেট কৰক।',
  },
  'Activities': { hi: 'गतिविधियाँ', bn: 'অ্যাক্টিভিটি', or: 'କାର୍ଯ୍ୟକଳାପ', as: 'কাৰ্য্যকলাপ' },
  'Call logs, meetings, emails, WhatsApp, tasks — every touchpoint a rep records.': {
    hi: 'कॉल लॉग्स, मीटिंग्स, ईमेल्स, WhatsApp, टास्क — हर वो टचपॉइंट जो रेप रिकॉर्ड करता है।',
    bn: 'কল লগ, মিটিং, ইমেইল, WhatsApp, টাস্ক — রেপের রেকর্ড করা প্রতিটি টাচপয়েন্ট।',
    or: 'କଲ୍ ଲଗ୍, ମିଟିଂ, ଇମେଲ୍, WhatsApp, ଟାସ୍କ୍ — ରେପ୍ ରେକର୍ଡ କରୁଥିବା ପ୍ରତ୍ୟେକ ଟଚ୍‌ପଏଣ୍ଟ।',
    as: 'কল লগ, মিটিং, ইমেইল, WhatsApp, কাম — ৰেপে ৰেকৰ্ড কৰা প্ৰতিটো টাচপইণ্ট।',
  },
  'Use it as your daily to-do. Calendar view shows what is due this week.': {
    hi: 'अपनी रोज़ की टू-डू के तौर पर इस्तेमाल करें। कैलेंडर व्यू दिखाता है इस हफ्ते क्या ड्यू है।',
    bn: 'প্রতিদিনের টু-ডু হিসেবে ব্যবহার করুন। ক্যালেন্ডার ভিউ দেখায় এই সপ্তাহে কী ডিউ আছে।',
    or: 'ଦୈନିକ ଟୁ-ଡୁ ଭାବେ ବ୍ୟବହାର କରନ୍ତୁ।',
    as: 'প্ৰতিদিনৰ টু-ডু হিচাপে ব্যৱহাৰ কৰক।',
  },
  'Send templates, see conversations, track delivery. Built on Meta Business API.': {
    hi: 'टेम्पलेट भेजें, बातचीत देखें, डिलिवरी ट्रैक करें। Meta Business API पर बना है।',
    bn: 'টেমপ্লেট পাঠান, কথোপকথন দেখুন, ডেলিভারি ট্র্যাক করুন। Meta Business API-এর উপর তৈরি।',
    or: 'ଟେମ୍ପଲେଟ୍ ପଠାନ୍ତୁ, କଥୋପକଥନ ଦେଖନ୍ତୁ, ଡେଲିଭରୀ ଟ୍ରାକ୍ କରନ୍ତୁ।',
    as: 'টেম্প্লেট পঠাওক, কথোপকথন চাওক, ডেলিভাৰী ট্ৰেক কৰক।',
  },
  'Use it for templated outreach (broadcast) or one-off replies on the same record.': {
    hi: 'टेम्पलेट आउटरीच (ब्रॉडकास्ट) या एक ही रिकॉर्ड पर वन-ऑफ रिप्लाई के लिए इस्तेमाल करें।',
    bn: 'টেমপ্লেট আউটরিচ (ব্রডকাস্ট) বা একই রেকর্ডে এক-অফ রিপ্লাইয়ের জন্য ব্যবহার করুন।',
    or: 'ଟେମ୍ପଲେଟ୍ ଆଉଟ୍‌ରିଚ୍ (ବ୍ରୋଡକାଷ୍ଟ୍) ବ୍ୟବହାର କରନ୍ତୁ।',
    as: 'টেম্প্লেট আউটৰিচ (ব্ৰডকাষ্ট) ব্যৱহাৰ কৰক।',
  },
  'Reports': { hi: 'रिपोर्ट्स', bn: 'রিপোর্ট', or: 'ରିପୋର୍ଟ୍', as: 'ৰিপ\'ৰ্ট' },
  '10 built-in reports: Rep Leaderboard, Stage Funnel, Stuck Deals, Lead Aging, Win/Loss, Forecast, Sales Cycle, Activity Heatmap, Lead Source ROI, plus a Custom Report Builder.': {
    hi: '10 बिल्ट-इन रिपोर्ट्स: Rep Leaderboard, Stage Funnel, Stuck Deals, Lead Aging, Win/Loss, Forecast, Sales Cycle, Activity Heatmap, Lead Source ROI, और Custom Report Builder।',
    bn: '10টি বিল্ট-ইন রিপোর্ট ও একটি Custom Report Builder।',
    or: '10 ଟି ବିଲ୍ଟ୍-ଇନ୍ ରିପୋର୍ଟ ଏବଂ ଗୋଟିଏ Custom Report Builder।',
    as: '10টা বিল্ট-ইন ৰিপ\'ৰ্ট আৰু এটা Custom Report Builder।',
  },
  'Use it monthly for review; export any report to CSV.': {
    hi: 'मासिक रिव्यू के लिए इस्तेमाल करें; किसी भी रिपोर्ट को CSV में एक्सपोर्ट करें।',
    bn: 'মাসিক রিভিউয়ের জন্য ব্যবহার করুন; যেকোনো রিপোর্ট CSV-তে এক্সপোর্ট করুন।',
    or: 'ମାସିକ ସମୀକ୍ଷା ପାଇଁ ବ୍ୟବହାର କରନ୍ତୁ।',
    as: 'মাহেকীয়া পৰ্যালোচনাৰ বাবে ব্যৱহাৰ কৰক।',
  },
  'Settings': { hi: 'सेटिंग्स', bn: 'সেটিংস', or: 'ସେଟିଂସ୍', as: 'ছেটিংছ' },
  '14 sub-pages: Team Members, Pipelines, Stages, Sources, Activity Types, Integrations, Automations, Assignment Rules, Territories, Scoring Model, Custom Fields, States & Cities, Business Type, Appearance.': {
    hi: '14 सब-पेज: Team Members, Pipelines, Stages, Sources, Activity Types, Integrations, Automations, Assignment Rules, Territories, Scoring Model, Custom Fields, States & Cities, Business Type, Appearance।',
    bn: '14টি সাব-পেজ।',
    or: '14 ଟି ସବ୍-ପୃଷ୍ଠା।',
    as: '14টা ছাব-পৃষ্ঠা।',
  },
  'Initial set-up + occasional tweaks.': {
    hi: 'शुरुआती सेटअप + कभी-कभार के बदलाव।',
    bn: 'প্রাথমিক সেটআপ + মাঝে মাঝে পরিবর্তন।',
    or: 'ପ୍ରାରମ୍ଭିକ ସେଟ୍‌ଅପ୍ + ବେଳେବେଳେ ବଦଳାନ୍ତୁ।',
    as: 'প্ৰাৰম্ভিক ছেটআপ + মাজে মাজে সালসলনি।',
  },
  'Help': { hi: 'सहायता', bn: 'সাহায্য', or: 'ସାହାଯ୍ୟ', as: 'সহায়' },
  "You're here.": {
    hi: 'आप यहाँ हैं।',
    bn: 'আপনি এখানে।',
    or: 'ଆପଣ ଏଠାରେ ଅଛନ୍ତି।',
    as: 'আপুনি ইয়াত আছে।',
  },
  'When a teammate asks "how does X work?" — point them here.': {
    hi: 'जब साथी पूछे "X कैसे काम करता है?" — उन्हें यहाँ भेजें।',
    bn: 'যখন সহকর্মী জিজ্ঞেস করে "X কীভাবে কাজ করে?" — তাদের এখানে পাঠান।',
    or: 'ଯେତେବେଳେ ସହକର୍ମୀ "X କିପରି କାମ କରେ?" ପଚାରନ୍ତି — ସେମାନଙ୍କୁ ଏଠାକୁ ପଠାନ୍ତୁ।',
    as: 'যেতিয়া সহকৰ্মীয়ে সোধে "X কেনেকৈ কাম কৰে?" — সিহঁতক ইয়ালৈ পঠিয়াওক।',
  },

  // ── ACTIONS (titles + details) ────────────────────────────────────
  'Dials the lead/contact and immediately logs a call activity. Cancel to keep the bare entry, save to add notes + duration.': {
    hi: 'लीड/कॉन्टैक्ट को डायल करता है और तुरंत कॉल एक्टिविटी लॉग करता है। नोट्स + अवधि जोड़ने के लिए सेव करें।',
    bn: 'লিড/কন্টাক্টকে ডায়াল করে এবং সাথে সাথে কল অ্যাক্টিভিটি লগ করে। নোট + সময়কাল যোগ করতে সেভ করুন।',
    or: 'ଲିଡ୍/କଣ୍ଟାକ୍ଟ୍‌କୁ ଡାୟଲ୍ କରେ ଏବଂ ତୁରନ୍ତ କଲ୍ କାର୍ଯ୍ୟକଳାପ ଲଗ୍ କରେ।',
    as: 'লিড/কন্টেক্টক ডায়েল কৰে আৰু লগে লগে কল কাৰ্য্যকলাপ লগ কৰে।',
  },
  'Opens a pre-filled WhatsApp thread. The conversation is captured by KINI Auto-Response if enabled.': {
    hi: 'एक प्री-फ़िल्ड WhatsApp थ्रेड खोलता है। यदि सक्षम है तो बातचीत KINI ऑटो-रिस्पॉन्स द्वारा कैप्चर होती है।',
    bn: 'একটি প্রি-ফিল WhatsApp থ্রেড খোলে। KINI Auto-Response চালু থাকলে কথোপকথন ক্যাপচার হয়।',
    or: 'ଏକ ପ୍ରୀ-ଫିଲ୍ଡ WhatsApp ଥ୍ରେଡ୍ ଖୋଲେ।',
    as: 'এটা প্ৰি-ফিল WhatsApp থ্ৰেড খোলে।',
  },
  'AI Score': { hi: 'AI स्कोर', bn: 'AI স্কোর', or: 'AI ସ୍କୋର', as: 'AI স্ক\'ৰ' },
  'Re-runs the KINI AI scoring model on the lead. The badge changes — green means high intent (70-100).': {
    hi: 'KINI AI स्कोरिंग मॉडल को लीड पर फिर से चलाता है। बैज बदलता है — हरा मतलब उच्च इरादा (70-100)।',
    bn: 'KINI AI স্কোরিং মডেল লিডের উপর আবার চালায়। ব্যাজ বদলায় — সবুজ মানে উচ্চ অভিপ্রায় (70-100)।',
    or: 'KINI AI ସ୍କୋରିଂ ମଡେଲ୍ ଲିଡ୍ ଉପରେ ପୁଣି ଚଳାଏ।',
    as: 'KINI AI স্ক\'ৰিং মডেলটো লিডটোৰ ওপৰত পুনৰ চলায়।',
  },
  'Promotes the lead to Contact + Account + Deal. The deal name pre-fills from the lead (editable); you land straight on the new Deal page so you can keep working.': {
    hi: 'लीड को Contact + Account + Deal में बढ़ाता है। डील का नाम लीड से प्री-फ़िल होता है (एडिटेबल)।',
    bn: 'লিডকে Contact + Account + Deal-এ উন্নীত করে। ডিলের নাম লিড থেকে প্রি-ফিল হয় (সম্পাদনযোগ্য)।',
    or: 'ଲିଡ୍‌କୁ Contact + Account + Deal କୁ ପ୍ରୋନ୍ନତ କରେ।',
    as: 'লিডটোক Contact + Account + Deal-লৈ উন্নীত কৰে।',
  },
  'Add to pipeline': { hi: 'पाइपलाइन में जोड़ें', bn: 'পাইপলাইনে যোগ', or: 'ପାଇପ୍‌ଲାଇନ୍‌କୁ ଯୋଗ', as: 'পাইপলাইনত যোগ' },
  'On the Deal detail. Picks a pipeline for the deal, lands it on the first open stage, and refreshes the stage stepper. Reads "Move pipeline" when the deal is already on one.': {
    hi: 'Deal detail पर। डील के लिए पाइपलाइन चुनता है, पहले ओपन स्टेज पर रखता है, और स्टेज स्टेपर रिफ़्रेश करता है।',
    bn: 'Deal detail-এ। ডিলের জন্য একটি পাইপলাইন বেছে নেয়, প্রথম ওপেন স্টেজে রাখে, এবং স্টেপার রিফ্রেশ করে।',
    or: 'Deal detail ଉପରେ। ଡିଲ୍ ପାଇଁ ଗୋଟିଏ ପାଇପ୍‌ଲାଇନ୍ ବାଛେ।',
    as: 'Deal detail-ত। ডিলৰ বাবে এটা পাইপলাইন বাছে।',
  },
  'Assign': { hi: 'असाइन', bn: 'অ্যাসাইন', or: 'ଆସାଇନ୍', as: 'এছাইন' },
  'Hands the lead/deal to another rep on the same team. Only same-client teammates are shown.': {
    hi: 'लीड/डील को उसी टीम के दूसरे रेप को सौंपता है। केवल समान-क्लाइंट के साथी दिखाए जाते हैं।',
    bn: 'লিড/ডিলকে একই দলের অন্য রেপের কাছে দেয়। শুধু একই-ক্লায়েন্টের সদস্যদের দেখানো হয়।',
    or: 'ଲିଡ୍/ଡିଲ୍‌କୁ ସମାନ ଦଳର ଅନ୍ୟ ରେପ୍‌କୁ ଦିଏ।',
    as: 'লিড/ডিলটো একে দলৰ আন এটা ৰেপলৈ দিয়ে।',
  },
  'Mark Unqualified': { hi: 'अनक्वालिफ़ाइड मार्क करें', bn: 'অযোগ্য চিহ্নিত করুন', or: 'ଅଯୋଗ୍ୟ ଚିହ୍ନଟ କରନ୍ତୁ', as: 'অযোগ্য চিহ্নিত কৰক' },
  'Closes the lead as not a fit (with a reason). Hidden from active views; can be reopened from the lead detail later.': {
    hi: 'लीड को "फ़िट नहीं" के तौर पर बंद करता है (कारण के साथ)। एक्टिव व्यू से छिप जाती है; बाद में लीड डिटेल से दोबारा खोली जा सकती है।',
    bn: 'লিডকে "ফিট নয়" হিসেবে বন্ধ করে (কারণ সহ)। সক্রিয় ভিউ থেকে লুকানো হয়; পরে লিড ডিটেইল থেকে আবার খোলা যায়।',
    or: 'ଲିଡ୍‌କୁ "ଫିଟ୍ ନୁହଁ" ଭାବେ ବନ୍ଦ କରେ।',
    as: 'লিডটোক "ফিট নহয়" বুলি বন্ধ কৰে।',
  },
  'Mark Lost': { hi: 'लॉस्ट मार्क करें', bn: 'লস্ট চিহ্নিত করুন', or: 'ଲସ୍ଟ ଚିହ୍ନଟ କରନ୍ତୁ', as: 'লস্ট চিহ্নিত কৰক' },
  'Closes the lead/deal as lost to a competitor / no decision. Captures reason for the Lost Reasons analytics widget.': {
    hi: 'लीड/डील को प्रतिस्पर्धी से हारी या निर्णय न होने के तौर पर बंद करता है।',
    bn: 'লিড/ডিলকে প্রতিযোগীর কাছে হার বা সিদ্ধান্তহীন হিসেবে বন্ধ করে।',
    or: 'ଲିଡ୍/ଡିଲ୍‌କୁ ପ୍ରତିଯୋଗୀଙ୍କ ନିକଟରେ ହାର କିମ୍ବା ନିଷ୍ପତ୍ତିହୀନ ଭାବେ ବନ୍ଦ କରେ।',
    as: 'লিড/ডিলটোক প্ৰতিদ্বন্দ্বীৰ ওচৰত হাৰ বা সিদ্ধান্তহীন বুলি বন্ধ কৰে।',
  },
  'Reopen': { hi: 'फिर से खोलें', bn: 'আবার খুলুন', or: 'ପୁଣି ଖୋଲନ୍ତୁ', as: 'পুনৰ খোলক' },
  'Flips an Unqualified / Lost / Converted lead back to Working. Used when a closed deal comes back to life.': {
    hi: 'अनक्वालिफ़ाइड / लॉस्ट / कन्वर्टेड लीड को वापस Working में पलटता है।',
    bn: 'অযোগ্য / লস্ট / কনভার্টেড লিডকে আবার Working-এ ফেরায়।',
    or: 'ଅଯୋଗ୍ୟ / ଲସ୍ଟ / କନଭର୍ଟେଡ୍ ଲିଡ୍‌କୁ ପୁଣି Working କୁ ଫେରାଏ।',
    as: 'অযোগ্য / লস্ট / কনভাৰ্টেড লিডটোক পুনৰ Working-লৈ ওভোতাই।',
  },

  // ── KINI capabilities ─────────────────────────────────────────────
  'KINI is the AI copilot built into every CRM screen. Open it from the floating ✦ button (bottom-right) or by hitting the mic anywhere. It speaks plain English (and 4 Indian languages), and it can *act* — not just answer questions.': {
    hi: 'KINI हर CRM स्क्रीन में बना AI कोपायलट है। नीचे-दाएँ ✦ बटन से या कहीं भी माइक से खोलें। यह सादी अंग्रेज़ी (और 4 भारतीय भाषाएँ) समझता है, और सवालों के जवाब के अलावा *कार्य भी कर सकता है*।',
    bn: 'KINI প্রতিটি CRM স্ক্রিনে নির্মিত AI কোপাইলট। নিচে-ডানে ✦ বোতাম থেকে বা যেকোনো জায়গায় মাইক টিপে খুলুন। এটি সাধারণ ইংরেজি (এবং 4টি ভারতীয় ভাষা) বুঝে, এবং প্রশ্নের উত্তরের পাশাপাশি *কাজও করতে পারে*।',
    or: 'KINI ପ୍ରତ୍ୟେକ CRM ସ୍କ୍ରୀନରେ ନିର୍ମିତ AI କୋପାଇଲଟ୍। ସରଳ ଇଂରାଜୀ (ଏବଂ 4 ଟି ଭାରତୀୟ ଭାଷା) ବୁଝେ।',
    as: 'KINI প্ৰতিটো CRM স্ক্ৰীণত নিৰ্মিত AI কপাইলট। সৰল ইংৰাজী (আৰু 4 টা ভাৰতীয় ভাষা) বুজে।',
  },
  'Fetch your CRM data': { hi: 'अपना CRM डेटा निकालें', bn: 'আপনার CRM ডেটা আনুন', or: 'ଆପଣଙ୍କ CRM ଡାଟା ଆଣନ୍ତୁ', as: 'আপোনাৰ CRM ডাটা আনক' },
  'Ask in plain language; KINI runs the right query and renders cards (lead lists, deal lists, summaries).': {
    hi: 'सादी भाषा में पूछें; KINI सही क्वेरी चलाता है और कार्ड्स (लीड लिस्ट, डील लिस्ट, सारांश) रेंडर करता है।',
    bn: 'সাধারণ ভাষায় জিজ্ঞাসা করুন; KINI সঠিক কোয়েরি চালায় এবং কার্ড রেন্ডার করে।',
    or: 'ସରଳ ଭାଷାରେ ପଚାରନ୍ତୁ; KINI ସଠିକ୍ ପ୍ରଶ୍ନ ଚଲାଏ ଏବଂ କାର୍ଡ ରେଣ୍ଡର କରେ।',
    as: 'সৰল ভাষাত সোধক; KINI-এ শুদ্ধ কুৱেৰী চলাই কাৰ্ড ৰেণ্ডাৰ কৰে।',
  },
  'Create + edit records': { hi: 'रिकॉर्ड बनाएँ + संपादित करें', bn: 'রেকর্ড তৈরি + সম্পাদনা', or: 'ରେକର୍ଡ ସୃଷ୍ଟି + ସମ୍ପାଦନା', as: 'ৰেকৰ্ড সৃষ্টি + সম্পাদনা' },
  'KINI can add leads, log activities, move deal stages, and assign owners — no form-filling. Mobile numbers are validated to 10 digits, no alphabets, so dial-tos always work.': {
    hi: 'KINI लीड्स जोड़ सकता है, गतिविधियाँ लॉग कर सकता है, डील स्टेज बदल सकता है, और ओनर असाइन कर सकता है — फ़ॉर्म नहीं भरना।',
    bn: 'KINI লিড যোগ করতে পারে, অ্যাক্টিভিটি লগ করতে পারে, ডিল স্টেজ পাল্টাতে পারে, এবং ওনার অ্যাসাইন করতে পারে — কোনো ফর্ম ভরতে হয় না।',
    or: 'KINI ଲିଡ୍ ଯୋଗ କରିପାରେ, କାର୍ଯ୍ୟକଳାପ ଲଗ୍ କରିପାରେ, ଡିଲ୍ ଷ୍ଟେଜ୍ ବଦଳାଇପାରେ।',
    as: 'KINI-এ লিড যোগ কৰিব পাৰে, কাৰ্য্যকলাপ লগ কৰিব পাৰে, ডিল ষ্টেজ সলনি কৰিব পাৰে।',
  },
  'Score & prioritise leads': { hi: 'लीड्स को स्कोर + प्राथमिकता दें', bn: 'লিড স্কোর + অগ্রাধিকার', or: 'ଲିଡ୍ ସ୍କୋର + ପ୍ରାଥମିକତା', as: 'লিড স্ক\'ৰ + অগ্ৰাধিকাৰ' },
  'AI lead scoring uses the ICP weights you configured + behavioural signals (page visits, response time, deal history).': {
    hi: 'AI लीड स्कोरिंग आपके कॉन्फ़िगर किए ICP वेट + व्यवहारिक संकेत (पेज विज़िट, रिस्पॉन्स टाइम, डील हिस्ट्री) इस्तेमाल करती है।',
    bn: 'AI লিড স্কোরিং আপনার কনফিগার করা ICP ওয়েট + আচরণগত সংকেত ব্যবহার করে।',
    or: 'AI ଲିଡ୍ ସ୍କୋରିଂ ଆପଣଙ୍କ କନ୍‌ଫିଗର କରାଯାଇଥିବା ICP ୱେଟ୍ + ଆଚରଣଗତ ସଙ୍କେତ ବ୍ୟବହାର କରେ।',
    as: 'AI লিড স্ক\'ৰিঙে আপুনি কনফিগাৰ কৰা ICP ওজন + আচৰণগত সংকেত ব্যৱহাৰ কৰে।',
  },
  'Next-Best-Action for deals': { hi: 'डील्स के लिए Next-Best-Action', bn: 'ডিলের জন্য Next-Best-Action', or: 'ଡିଲ୍ ପାଇଁ Next-Best-Action', as: 'ডিলৰ বাবে Next-Best-Action' },
  "Given a deal's stage, last activity, and competitor profile, KINI suggests the single highest-impact next move.": {
    hi: 'डील के स्टेज, अंतिम गतिविधि और प्रतिस्पर्धी प्रोफ़ाइल के आधार पर KINI सबसे प्रभावी अगला कदम सुझाता है।',
    bn: 'ডিলের স্টেজ, শেষ অ্যাক্টিভিটি এবং প্রতিযোগী প্রোফাইলের ভিত্তিতে KINI সবচেয়ে কার্যকর পরবর্তী পদক্ষেপ পরামর্শ দেয়।',
    or: 'ଡିଲ୍‌ର ଷ୍ଟେଜ୍, ଶେଷ କାର୍ଯ୍ୟକଳାପ ଏବଂ ପ୍ରତିଯୋଗୀ ପ୍ରୋଫାଇଲ୍ ଆଧାରରେ KINI ସର୍ବାଧିକ ପ୍ରଭାବଶାଳୀ ପରବର୍ତ୍ତୀ ପଦକ୍ଷେପ ସୁପାରିଶ କରେ।',
    as: 'ডিলৰ ষ্টেজ, শেষ কাৰ্য্যকলাপ আৰু প্ৰতিদ্বন্দ্বী প্ৰ\'ফাইলৰ আধাৰত KINI-এ আটাইতকৈ প্ৰভাৱশালী পৰৱৰ্তী পদক্ষেপ পৰামৰ্শ দিয়ে।',
  },
  'Win-probability prediction': { hi: 'विन-प्रोबेबिलिटी पूर्वानुमान', bn: 'উইন-প্রোবাবিলিটি পূর্বাভাস', or: 'ୱିନ୍-ପ୍ରୋବାବିଲିଟି ପୂର୍ବାନୁମାନ', as: 'ৱিন-প্ৰ\'বেবিলিটি পূৰ্বানুমান' },
  "A model-backed probability separate from the rep's manual guess. Drives the Forecast chart.": {
    hi: 'मॉडल-समर्थित प्रोबेबिलिटी जो रेप के मैन्युअल अनुमान से अलग है। Forecast चार्ट चलाती है।',
    bn: 'রেপের ম্যানুয়াল অনুমান থেকে আলাদা একটি মডেল-সমর্থিত প্রোবাবিলিটি।',
    or: 'ରେପ୍‌ର ମାନୁଆଲ୍ ଅନୁମାନଠାରୁ ଅଲଗା ଗୋଟିଏ ମଡେଲ୍-ସମର୍ଥିତ ପ୍ରୋବାବିଲିଟି।',
    as: 'ৰেপৰ মেনুৱেল অনুমানৰ পৰা পৃথক এটা মডেল-সমৰ্থিত প্ৰ\'বেবিলিটি।',
  },
  'Draft email replies': { hi: 'ईमेल जवाब लिखें', bn: 'ইমেইল উত্তর লিখুন', or: 'ଇମେଲ୍ ଉତ୍ତର ଲେଖନ୍ତୁ', as: 'ইমেইল উত্তৰ লিখক' },
  "Generates context-aware follow-ups in your tone. Uses the lead/deal history as grounding so KINI doesn't fabricate.": {
    hi: 'आपके लहजे में संदर्भ-समझ वाले फ़ॉलोअप तैयार करता है। लीड/डील इतिहास को आधार के तौर पर इस्तेमाल करता है।',
    bn: 'আপনার টোনে প্রসঙ্গ-সচেতন ফলো-আপ তৈরি করে। লিড/ডিল ইতিহাসকে ভিত্তি হিসেবে ব্যবহার করে।',
    or: 'ଆପଣଙ୍କ ସ୍ୱରରେ ପ୍ରସଙ୍ଗ-ସଚେତନ ଫଲୋ-ଅପ୍ ସୃଷ୍ଟି କରେ।',
    as: 'আপোনাৰ স্বৰত প্ৰসংগ-সচেতন ফলো-আপ সৃষ্টি কৰে।',
  },
  'Summarise accounts + deals': { hi: 'अकाउंट + डील्स का सारांश', bn: 'অ্যাকাউন্ট + ডিল সারাংশ', or: 'ଆକାଉଣ୍ଟ୍ + ଡିଲ୍ ସାରାଂଶ', as: 'একাউণ্ট + ডিল সাৰাংশ' },
  'One-paragraph summary of an Account or Deal — every activity, every note, every linked lead.': {
    hi: 'किसी Account या Deal का एक-पैराग्राफ़ सारांश — हर गतिविधि, हर नोट, हर लिंक्ड लीड।',
    bn: 'একটি Account বা Deal-এর এক-অনুচ্ছেদ সারাংশ।',
    or: 'ଗୋଟିଏ Account କିମ୍ବା Deal ର ଏକ-ଅନୁଚ୍ଛେଦ ସାରାଂଶ।',
    as: 'এটা Account বা Deal-ৰ এক-অনুচ্ছেদ সাৰাংশ।',
  },
  'Multi-language': { hi: 'बहु-भाषीय', bn: 'বহু-ভাষা', or: 'ବହୁ-ଭାଷୀ', as: 'বহু-ভাষা' },
  'KINI replies in the language you write to it: English, हिन्दी (Devanagari), বাংলা, ଓଡ଼ିଆ, অসমীয়া. Tool calls (arguments, IDs) stay in English so data integrity is preserved.': {
    hi: 'KINI उसी भाषा में जवाब देता है जिसमें आप लिखते हैं: English, हिन्दी, বাংলা, ଓଡ଼ିଆ, অসমীয়া। टूल कॉल (आर्गुमेंट, IDs) अंग्रेज़ी में रहते हैं ताकि डेटा अखंडता बनी रहे।',
    bn: 'KINI আপনি যে ভাষায় লেখেন সেই ভাষায় উত্তর দেয়: English, हिन्दी, বাংলা, ଓଡ଼ିଆ, অসমীয়া।',
    or: 'KINI ଆପଣ ଯେଉଁ ଭାଷାରେ ଲେଖନ୍ତି ସେହି ଭାଷାରେ ଉତ୍ତର ଦିଏ।',
    as: 'KINI আপুনি যি ভাষাত লিখে সেই ভাষাতে উত্তৰ দিয়ে।',
  },
  'Voice in + voice out': { hi: 'वॉइस इन + वॉइस आउट', bn: 'ভয়েস ইন + ভয়েস আউট', or: 'ଭଏସ୍ ଇନ୍ + ଭଏସ୍ ଆଉଟ୍', as: 'ভইছ ইন + ভইছ আউট' },
  "Hold the mic button on the chat widget. KINI transcribes via the browser's speech API and answers back if you enable Hands-Free in the header.": {
    hi: 'चैट विजेट पर माइक बटन दबाए रखें। KINI ब्राउज़र के स्पीच API से ट्रांसक्राइब करता है और Hands-Free चालू होने पर बोलकर जवाब देता है।',
    bn: 'চ্যাট উইজেটে মাইক বোতাম চেপে ধরুন। KINI ব্রাউজারের স্পিচ API দিয়ে ট্রান্সক্রাইব করে।',
    or: 'ଚାଟ୍ ୱିଜେଟ୍‌ରେ ମାଇକ୍ ବଟନ୍ ଚାପି ଧରନ୍ତୁ।',
    as: 'চেট উইজেটত মাইক বুটাম ধৰি ৰাখক।',
  },

  // ── Analytics report rows ─────────────────────────────────────────
  'Lead velocity, time-to-first-touch, stuck leads, score-band conversion, territory heatmap.': {
    hi: 'लीड वेलोसिटी, टाइम-टू-फ़र्स्ट-टच, स्टक लीड्स, स्कोर-बैंड कन्वर्ज़न, टेरिटरी हीटमैप।',
    bn: 'লিড ভেলোসিটি, টাইম-টু-ফার্স্ট-টাচ, স্টাক লিড, স্কোর-ব্যান্ড কনভার্শন, টেরিটরি হিটম্যাপ।',
    or: 'ଲିଡ୍ ଭେଲୋସିଟି, ଟାଇମ୍-ଟୁ-ଫର୍ଷ୍ଟ-ଟଚ୍, ଷ୍ଟକ୍ ଲିଡ୍, ସ୍କୋର-ବ୍ୟାଣ୍ଡ କନଭର୍ସନ୍, ଟେରିଟୋରୀ ହିଟ୍‌ମ୍ୟାପ୍।',
    as: 'লিড ভেলোচিটি, টাইম-টু-ফাৰ্ষ্ট-টাচ, ষ্টাক লিড, স্ক\'ৰ-বেণ্ড কনভাৰ্ছন, টেৰিটৰি হিটমেপ।',
  },
  'Rep Leaderboard': { hi: 'रेप लीडरबोर्ड', bn: 'রেপ লিডারবোর্ড', or: 'ରେପ୍ ଲିଡରବୋର୍ଡ', as: 'ৰেপ লিডাৰব\'ৰ্ড' },
  'Calls / meetings / wins per rep — week, month, or custom range.': {
    hi: 'प्रति रेप कॉल्स / मीटिंग्स / जीत — सप्ताह, महीना, या कस्टम रेंज।',
    bn: 'রেপ-প্রতি কল / মিটিং / জয় — সপ্তাহ, মাস, বা কাস্টম রেঞ্জ।',
    or: 'ପ୍ରତି ରେପ୍ କଲ୍ / ମିଟିଂ / ବିଜୟ।',
    as: 'প্ৰতি ৰেপ কল / মিটিং / জয়।',
  },
  'Stage Funnel': { hi: 'स्टेज फ़नल', bn: 'স্টেজ ফানেল', or: 'ଷ୍ଟେଜ୍ ଫନେଲ୍', as: 'ষ্টেজ ফানেল' },
  'How many deals pass through each stage. Spot the leaky step.': {
    hi: 'हर स्टेज से कितनी डील्स गुज़रती हैं। लीक होने वाला कदम पहचानें।',
    bn: 'প্রতিটি স্টেজ দিয়ে কতগুলো ডিল যায়। ফাঁস হওয়া ধাপ চিহ্নিত করুন।',
    or: 'ପ୍ରତ୍ୟେକ ଷ୍ଟେଜ୍ ଦେଇ କେତୋଟି ଡିଲ୍ ଯାଏ।',
    as: 'প্ৰতিটো ষ্টেজৰ মাজেৰে কেইটা ডিল যায়।',
  },
  'Stuck Deals': { hi: 'अटकी हुई डील्स', bn: 'আটকে থাকা ডিল', or: 'ଅଟକି ଥିବା ଡିଲ୍', as: 'আবদ্ধ ডিল' },
  "Deals that haven't moved in 14+ days. Sortable by days-in-stage and amount.": {
    hi: '14+ दिनों से नहीं हिली डील्स। डेज़-इन-स्टेज और राशि से सॉर्ट करें।',
    bn: '14+ দিন ধরে নড়েনি এমন ডিল। ডেইজ-ইন-স্টেজ এবং পরিমাণ অনুসারে সাজান।',
    or: '14+ ଦିନ ଧରି ନ ହଲିଥିବା ଡିଲ୍।',
    as: '14+ দিন ধৰি নলৰা ডিল।',
  },
  'Lead Aging': { hi: 'लीड एजिंग', bn: 'লিড এজিং', or: 'ଲିଡ୍ ଏଜିଂ', as: 'লিড এজিং' },
  'Days since last contact, per lead. Use it to triage which old leads to call back.': {
    hi: 'प्रति लीड पिछली कॉन्टैक्ट के बाद के दिन। पुरानी लीड्स में से किसे कॉल बैक करना है, यह तय करें।',
    bn: 'লিড-প্রতি শেষ যোগাযোগের পর কত দিন। কোন পুরনো লিডকে ফিরতি কল করবেন তা ঠিক করুন।',
    or: 'ପ୍ରତି ଲିଡ୍ ଶେଷ ସମ୍ପର୍କ ପରେ କେତେ ଦିନ।',
    as: 'প্ৰতি লিড শেষ যোগাযোগৰ পিছত কেইদিন।',
  },
  'Win/Loss': { hi: 'विन/लॉस', bn: 'উইন/লস', or: 'ୱିନ୍/ଲସ୍', as: 'ৱিন/লছ' },
  'Win rate by stage, source, owner, and lost-reason. Drill into any segment.': {
    hi: 'स्टेज, सोर्स, ओनर और लॉस्ट-रीज़न के अनुसार विन रेट। किसी भी सेगमेंट में जाएँ।',
    bn: 'স্টেজ, সোর্স, ওনার, এবং লস্ট-রিজন অনুসারে উইন রেট।',
    or: 'ଷ୍ଟେଜ୍, ସୋର୍ସ, ଓନର, ଏବଂ ଲସ୍ଟ-ରିଜନ୍ ଅନୁସାରେ ୱିନ୍ ରେଟ୍।',
    as: 'ষ্টেজ, ছ\'ৰ্ছ, ওনাৰ আৰু লস্ট-ৰিজন অনুসৰি ৱিন ৰেট।',
  },
  'Forecast': { hi: 'फ़ोरकास्ट', bn: 'ফোরকাস্ট', or: 'ଫୋରକାଷ୍ଟ୍', as: 'ফ\'ৰকাষ্ট' },
  'Weighted pipeline rolled up by month, scaled by KINI AI win probability.': {
    hi: 'महीने के अनुसार वेटेड पाइपलाइन, KINI AI विन प्रोबेबिलिटी से स्केल की हुई।',
    bn: 'মাস অনুযায়ী ওজনযুক্ত পাইপলাইন, KINI AI উইন প্রোবাবিলিটি দিয়ে স্কেল করা।',
    or: 'ମାସ ଅନୁଯାୟୀ ୱେଟେଡ୍ ପାଇପ୍‌ଲାଇନ୍।',
    as: 'মাহ অনুসৰি ওজনযুক্ত পাইপলাইন।',
  },
  'Sales Cycle': { hi: 'सेल्स साइकल', bn: 'সেলস সাইকেল', or: 'ସେଲ୍ସ ସାଇକଲ୍', as: 'চেলছ চাইকেল' },
  'Average days lead-to-won / lead-to-lost, segmented by source and product.': {
    hi: 'औसत दिन लीड-से-वन / लीड-से-लॉस्ट, सोर्स और प्रोडक्ट से सेगमेंट किए हुए।',
    bn: 'গড় দিন লিড-টু-উইন / লিড-টু-লস, সোর্স এবং প্রোডাক্ট অনুসারে।',
    or: 'ହାରାହାରି ଦିନ ଲିଡ୍-ଟୁ-ୱନ୍ / ଲିଡ୍-ଟୁ-ଲସ୍।',
    as: 'গড় দিন লিড-টু-ৱন / লিড-টু-লছ।',
  },
  'Activity Heatmap': { hi: 'एक्टिविटी हीटमैप', bn: 'অ্যাক্টিভিটি হিটম্যাপ', or: 'ଆକ୍ଟିଭିଟି ହିଟ୍‌ମ୍ୟାପ୍', as: 'এক্টিভিটি হিটমেপ' },
  'Calls + meetings + WhatsApp by hour-of-day and day-of-week. Plan outreach blocks.': {
    hi: 'घंटे-दर-दिन और दिन-दर-सप्ताह कॉल्स + मीटिंग्स + WhatsApp। आउटरीच ब्लॉक्स प्लान करें।',
    bn: 'ঘন্টা-প্রতি-দিন এবং দিন-প্রতি-সপ্তাহ কল + মিটিং + WhatsApp।',
    or: 'ଘଣ୍ଟା-ପ୍ରତି-ଦିନ ଏବଂ ଦିନ-ପ୍ରତି-ସପ୍ତାହ କଲ୍ + ମିଟିଂ + WhatsApp।',
    as: 'ঘণ্টা-প্ৰতি-দিন আৰু দিন-প্ৰতি-সপ্তাহ কল + মিটিং + WhatsApp।',
  },
  'Lead Source ROI': { hi: 'लीड सोर्स ROI', bn: 'লিড সোর্স ROI', or: 'ଲିଡ୍ ସୋର୍ସ ROI', as: 'লিড ছ\'ৰ্ছ ROI' },
  'Cost-per-lead vs revenue closed, per source. Tells you where to spend next month.': {
    hi: 'प्रति सोर्स कॉस्ट-पर-लीड बनाम क्लोज़ हुई रेवेन्यू। अगले महीने कहाँ खर्च करें यह बताता है।',
    bn: 'সোর্স-প্রতি কস্ট-পার-লিড বনাম ক্লোজ হওয়া রেভিনিউ। পরের মাসে কোথায় খরচ করবেন তা বলে।',
    or: 'ସୋର୍ସ-ପ୍ରତି କଷ୍ଟ-ପର-ଲିଡ୍ ବନାମ କ୍ଲୋଜ୍ ହୋଇଥିବା ରେଭିନ୍ୟୁ।',
    as: 'ছ\'ৰ্ছ-প্ৰতি কষ্ট-পাৰ-লিড বনাম ক্লোজ হোৱা ৰাজহ।',
  },
  'Custom Report Builder': { hi: 'कस्टम रिपोर्ट बिल्डर', bn: 'কাস্টম রিপোর্ট বিল্ডার', or: 'କଷ୍ଟମ୍ ରିପୋର୍ଟ ବିଲ୍ଡର୍', as: 'কাষ্টম ৰিপ\'ৰ্ট বিল্ডাৰ' },
  'Drag-drop fields to build any report. Save and pin it to your dashboard.': {
    hi: 'किसी भी रिपोर्ट के लिए फ़ील्ड्स ड्रैग-ड्रॉप करें। सहेजें और अपने डैशबोर्ड पर पिन करें।',
    bn: 'যেকোনো রিপোর্ট তৈরি করতে ফিল্ড ড্র্যাগ-ড্রপ করুন।',
    or: 'ଯେକୌଣସି ରିପୋର୍ଟ ତିଆରି କରିବାକୁ ଫିଲ୍ଡ୍ ଡ୍ରାଗ୍-ଡ୍ରପ୍ କରନ୍ତୁ।',
    as: 'যিকোনো ৰিপ\'ৰ্ট সাজিবলৈ ফিল্ড ড্ৰেগ-ড্ৰপ কৰক।',
  },

  // ── TIPS ───────────────────────────────────────────────────────────
  'Tap the phone number on any lead → both a call AND an activity land in one gesture.': {
    hi: 'किसी भी लीड का फ़ोन नंबर टैप करें → कॉल और गतिविधि दोनों एक ही जेस्चर में दर्ज होते हैं।',
    bn: 'যেকোনো লিডের ফোন নম্বরে ট্যাপ করুন → একই ইশারায় কল ও অ্যাক্টিভিটি দুটোই হয়।',
    or: 'ଯେକୌଣସି ଲିଡ୍‌ର ଫୋନ୍ ନମ୍ବର ଟ୍ୟାପ୍ କରନ୍ତୁ → ଗୋଟିଏ ଅଙ୍ଗଭଙ୍ଗୀରେ କଲ୍ ଏବଂ ଗତିବିଧି ଉଭୟ ହୁଏ।',
    as: 'যিকোনো লিডৰ ফোন নম্বৰত টেপ কৰক → এটাতে কল আৰু কাৰ্য্যকলাপ দুয়োটা হয়।',
  },
  'The KINI AI floating button (bottom-right) is your AI helper. Hold the mic for voice; toggle Hands-Free for back-and-forth conversations.': {
    hi: 'KINI AI फ़्लोटिंग बटन (नीचे-दाएँ) आपका AI सहायक है। आवाज़ के लिए माइक दबाएँ; आगे-पीछे की बातचीत के लिए Hands-Free चालू करें।',
    bn: 'KINI AI ভাসমান বোতাম (নিচে-ডানে) আপনার AI সহকারী। ভয়েসের জন্য মাইক ধরে রাখুন; দ্বিমুখী কথোপকথনের জন্য Hands-Free চালু করুন।',
    or: 'KINI AI ଭାସମାନ ବଟନ୍ (ତଳ-ଡାହାଣ) ଆପଣଙ୍କ AI ସହାୟକ।',
    as: 'KINI AI ভাঁহি থকা বুটাম (তলৰ সোঁফালে) আপোনাৰ AI সহায়ক।',
  },
  'Tasks on the inbox are coloured by urgency. Red = overdue. Blue = today. Pull-to-refresh on mobile.': {
    hi: 'इनबॉक्स में टास्क अर्जेंसी से रंगे हैं। लाल = ओवरड्यू। नीला = आज। मोबाइल पर पुल-टू-रिफ्रेश।',
    bn: 'ইনবক্সে কাজগুলো জরুরিতা অনুসারে রঙিন। লাল = অতিরিক্ত সময়। নীল = আজ।',
    or: 'ଇନ୍‌ବକ୍ସରେ କାର୍ଯ୍ୟଗୁଡ଼ିକ ଜରୁରୀତା ଅନୁସାରେ ରଙ୍ଗ ହୋଇଛନ୍ତି।',
    as: 'ইনবক্সত কামবোৰ জৰুৰীতা অনুসৰি ৰঙীন। ৰঙা = অতিৰিক্ত সময়। নীলা = আজি।',
  },
  'Win Probability is the KINI AI guess based on stage + age + recent activity. It updates when you log meaningful interactions.': {
    hi: 'Win Probability KINI AI का अनुमान है — स्टेज + उम्र + हाल की गतिविधि के आधार पर। सार्थक इंटरैक्शन लॉग करते ही अपडेट होता है।',
    bn: 'Win Probability হল KINI AI-এর অনুমান — স্টেজ + বয়স + সাম্প্রতিক অ্যাক্টিভিটি ভিত্তিতে।',
    or: 'Win Probability ହେଉଛି KINI AI ର ଅନୁମାନ।',
    as: 'Win Probability হৈছে KINI AI-ৰ অনুমান।',
  },
  'Pin any chart from Lead Analytics to your Overview so it loads alongside the stat cards every morning.': {
    hi: 'Lead Analytics से किसी भी चार्ट को अपने Overview पर पिन करें ताकि वह हर सुबह स्टैट कार्ड्स के साथ लोड हो।',
    bn: 'Lead Analytics থেকে যেকোনো চার্ট আপনার Overview-এ পিন করুন।',
    or: 'Lead Analytics ରୁ ଯେକୌଣସି ଚାର୍ଟ Overview ରେ ପିନ୍ କରନ୍ତୁ।',
    as: 'Lead Analytics-ৰ পৰা যিকোনো চাৰ্ট আপোনাৰ Overview-ত পিন কৰক।',
  },
  'Settings → Custom Fields lets you add per-entity fields AND override built-in field labels (e.g. rename "Title" to "Designation") without code.': {
    hi: 'Settings → Custom Fields से प्रति-एंटिटी फ़ील्ड्स जोड़ें और बिल्ट-इन फ़ील्ड लेबल्स को कोड के बिना ओवरराइड करें।',
    bn: 'Settings → Custom Fields থেকে এন্টিটি-প্রতি ফিল্ড যোগ করুন এবং বিল্ট-ইন ফিল্ড লেবেল ওভাররাইড করুন।',
    or: 'Settings → Custom Fields ରୁ ଏନ୍ଟିଟି-ପ୍ରତି ଫିଲ୍ଡ୍ ଯୋଗ କରନ୍ତୁ।',
    as: 'Settings → Custom Fields-ৰ পৰা এণ্টিটি-প্ৰতি ফিল্ড যোগ কৰক।',
  },
  'Settings → Business Type controls which fields show on lead/contact forms. B2B = company + industry first; B2C = DOB + address + consent first.': {
    hi: 'Settings → Business Type नियंत्रित करता है कि लीड/कॉन्टैक्ट फ़ॉर्म पर कौन से फ़ील्ड दिखें। B2B = कंपनी + इंडस्ट्री पहले; B2C = DOB + पता + सहमति पहले।',
    bn: 'Settings → Business Type নিয়ন্ত্রণ করে কোন ফিল্ড লিড/কন্টাক্ট ফর্মে দেখা যাবে।',
    or: 'Settings → Business Type ନିୟନ୍ତ୍ରଣ କରେ କେଉଁ ଫିଲ୍ଡ୍ ଦେଖାଯିବ।',
    as: 'Settings → Business Type-এ নিয়ন্ত্ৰণ কৰে কোনবোৰ ফিল্ড দেখুৱাব।',
  },
  'Use the global Client filter (top-right) to switch context — every list, chart, and report re-scopes to the selected client.': {
    hi: 'ग्लोबल Client फ़िल्टर (ऊपर-दाएँ) से कॉन्टेक्स्ट बदलें — हर सूची, चार्ट और रिपोर्ट चुने हुए क्लाइंट के दायरे में आ जाते हैं।',
    bn: 'গ্লোবাল Client ফিল্টার (উপরে-ডানে) দিয়ে কনটেক্সট পাল্টান।',
    or: 'ଗ୍ଲୋବାଲ୍ Client ଫିଲ୍ଟର (ଉପର-ଡାହାଣ) ସହିତ ପ୍ରସଙ୍ଗ ବଦଳାନ୍ତୁ।',
    as: 'গ্লোবেল Client ফিল্টাৰ (ওপৰৰ সোঁফালে) দি প্ৰসংগ সলনি কৰক।',
  },
  'KINI AI is quota-capped per user per month; the badge on the chat header shows usage. Org-level cap is also enforced.': {
    hi: 'KINI AI प्रति यूज़र प्रति महीने कोटा-कैप्ड है; चैट हेडर पर बैज उपयोग दिखाता है।',
    bn: 'KINI AI প্রতি ব্যবহারকারী প্রতি মাসে কোটা-সীমাবদ্ধ।',
    or: 'KINI AI ପ୍ରତି ବ୍ୟବହାରକାରୀ ପ୍ରତି ମାସରେ କୋଟା-ସୀମିତ।',
    as: 'KINI AI প্ৰতি ব্যৱহাৰকাৰীৰ প্ৰতি মাহত কোটা-সীমিত।',
  },
  'Mobile number fields are 10-digit numeric only — no alphabets, no country code. The keypad pops up automatically on mobile.': {
    hi: 'मोबाइल नंबर फ़ील्ड केवल 10-अंकीय न्यूमेरिक हैं — कोई अक्षर नहीं, कोई कंट्री कोड नहीं।',
    bn: 'মোবাইল নম্বর ফিল্ড শুধু 10-ডিজিট সংখ্যা — কোনো অক্ষর বা কান্ট্রি কোড নয়।',
    or: 'ମୋବାଇଲ୍ ନମ୍ବର ଫିଲ୍ଡ୍ କେବଳ 10-ଅଙ୍କ ସଂଖ୍ୟା — କୌଣସି ଅକ୍ଷର କିମ୍ବା କଣ୍ଟ୍ରୀ କୋଡ୍ ନୁହଁ।',
    as: 'ম\'বাইল নম্বৰ ফিল্ড কেৱল 10-অংকৰ সংখ্যা।',
  },
};

function useHelpLang(): [LangCode, (l: LangCode) => void] {
  const [lang, setLang] = useState<LangCode>('en');
  useEffect(() => {
    try {
      const saved = (localStorage.getItem('kinematic-help-lang') as LangCode | null);
      if (saved && LANGS.some((l) => l.code === saved)) setLang(saved);
    } catch { /* ignore */ }
  }, []);
  const update = (l: LangCode) => {
    setLang(l);
    try { localStorage.setItem('kinematic-help-lang', l); } catch { /* ignore */ }
  };
  return [lang, update];
}

function tr(en: string, lang: LangCode): string {
  if (lang === 'en') return en;
  return T[en]?.[lang] ?? en;
}
const SUPPORT_PHONE = '+91 88022 74880';
const SUPPORT_PHONE_DIAL = '+918802274880';
const SUPPORT_EMAIL = 's@kinematicapp.com';

const STAGES = [
  { n: 1, title: 'Lead arrives',  detail: 'From a web form, lead-source integration (Meta/Google/Zoho), CSV import, KINI AI auto-capture, or a rep typing it in. Status starts as NEW; dedup runs immediately on phone+email so the same person never lands twice.' },
  { n: 2, title: 'Qualify',       detail: 'Call, WhatsApp or meet the lead. Move status NEW → WORKING → NURTURING → QUALIFIED. The AI score (0-100) and Lead Score Distribution chart help prioritise — focus on 70+.' },
  { n: 3, title: 'Convert',       detail: 'Tap Convert. The deal name is pre-filled from the lead so you can edit it in one tap. Kinematic spins up a Contact, Account (B2B only), and a Deal placed on your default pipeline. You land straight on the new Deal page.' },
  { n: 4, title: 'Move the deal', detail: 'On the Deal detail, an inline stage stepper shows your progress — blue is current, green ticks are past, grey is upcoming. Tap any stage to jump, or hit ✓ Mark Complete to advance one step. Win Probability + Next-Best-Action refresh from KINI AI as you go. Prefer a board view? Switch the Deals page to ▦ Kanban and drag deals between columns.' },
  { n: 5, title: 'Close',         detail: 'Mark Won (with amount + close date) or Lost (with reason + competitor). Won deals add to revenue charts and Forecast; lost reasons feed Win/Loss + Lost Reasons analytics.' },
];

// The 13 CRM modules — what each one is for, in one line plus a short
// "use it when…" trigger. Mirrors the CrmSubNav order so the help reads
// top-down the same way the rep navigates.
const MODULES: Array<{ icon: string; title: string; what: string; when: string }> = [
  { icon: '📊', title: 'Dashboard (Overview)', what: 'Stat cards (open pipeline, win rate, avg deal), the geo-map of leads, and your pinned analytics widgets.', when: 'Use it when you start your day to see what changed overnight.' },
  { icon: '🎯', title: 'Leads',                what: 'Full list with filters (status, source, owner, score, state/city/district), AI score badges, bulk-assign, CSV import. Lead detail layout is fully responsive — read it on a phone in the car between meetings.', when: 'Use it when you need to slice prospects — "show me hot leads in Mumbai assigned to Ramesh".' },
  { icon: '📈', title: 'Lead Analytics',       what: 'Customisable widget grid: lead velocity, time-to-first-touch, stuck leads, cohort conversion, score-band conversion, territory map. Pin any widget to your Overview.', when: 'Use it weekly to see where the funnel is leaking.' },
  { icon: '👥', title: 'Contacts',             what: 'Your people directory. B2C contacts carry consent + loyalty tier; B2B contacts link to an Account.', when: 'Use it to manage individuals across multiple deals or repeat customers.' },
  { icon: '🏢', title: 'Accounts',             what: 'Company records that group contacts + deals together. Industry, revenue, domain, owner.', when: 'B2B sellers: this is the canonical "who is the buying organisation" view.' },
  { icon: '💼', title: 'Deals',                what: 'Open opportunities with stage, amount, probability, expected close date, line items. Toggle ☰ List ⇄ ▦ Kanban from the header — kanban filters by pipeline so you can drag deals between stages.', when: 'Use it to see your active pipeline. Switch to Kanban on Monday morning to triage; stay on List for bulk edits and filters.' },
  { icon: '📋', title: 'Pipeline',             what: 'Directory of pipelines (Enterprise, SMB, Channel etc.). Each row shows stages, open-deal count + total value. + New Pipeline lets you create the pipeline AND its stages (Open / Won / Lost, colour-coded) in one modal — no separate Settings trip.', when: 'Use it when you set up a new sales motion or want a high-level "what pipelines exist?" view. Kanban view of any pipeline → its row → Kanban →.' },
  { icon: '📦', title: 'Products',             what: 'SKU catalogue with price, weight, GST rate, category. Deals reference products via line items.', when: 'Set up once when you onboard; touch when prices change.' },
  { icon: '✅', title: 'Activities',           what: 'Call logs, meetings, emails, WhatsApp, tasks — every touchpoint a rep records.', when: 'Use it as your daily to-do. Calendar view shows what is due this week.' },
  { icon: '💬', title: 'WhatsApp',             what: 'Send templates, see conversations, track delivery. Built on Meta Business API.', when: 'Use it for templated outreach (broadcast) or one-off replies on the same record.' },
  { icon: '📑', title: 'Reports',              what: '10 built-in reports: Rep Leaderboard, Stage Funnel, Stuck Deals, Lead Aging, Win/Loss, Forecast, Sales Cycle, Activity Heatmap, Lead Source ROI, plus a Custom Report Builder.', when: 'Use it monthly for review; export any report to CSV.' },
  { icon: '⚙️', title: 'Settings',             what: '14 sub-pages: Team Members, Pipelines, Stages, Sources, Activity Types, Integrations, Automations, Assignment Rules, Territories, Scoring Model, Custom Fields, States & Cities, Business Type, Appearance.', when: 'Initial set-up + occasional tweaks.' },
  { icon: '❓', title: 'Help',                 what: "You're here.", when: 'When a teammate asks "how does X work?" — point them here.' },
];

const ACTIONS: Array<{ icon: string; color: string; title: string; detail: string }> = [
  { icon: '📞', color: '#1E88E5', title: 'Call',        detail: 'Dials the lead/contact and immediately logs a call activity. Cancel to keep the bare entry, save to add notes + duration.' },
  // WhatsApp action keeps the chat-bubble emoji but uses the same neutral
  // grey colour as Mark Unqualified so it doesn't stand out as the only
  // brand-coloured row in the action list.
  { icon: '💬', color: '#757575', title: 'WhatsApp',    detail: 'Opens a pre-filled WhatsApp thread. The conversation is captured by KINI Auto-Response if enabled.' },
  { icon: '✨', color: '#8E24AA', title: 'AI Score',    detail: 'Re-runs the KINI AI scoring model on the lead. The badge changes — green means high intent (70-100).' },
  { icon: '🔀', color: RED,       title: 'Convert',     detail: 'Promotes the lead to Contact + Account + Deal. The deal name pre-fills from the lead (editable); you land straight on the new Deal page so you can keep working.' },
  { icon: '🧭', color: BLUE,      title: 'Add to pipeline',  detail: 'On the Deal detail. Picks a pipeline for the deal, lands it on the first open stage, and refreshes the stage stepper. Reads "Move pipeline" when the deal is already on one.' },
  { icon: '👤', color: '#FB8C00', title: 'Assign',      detail: 'Hands the lead/deal to another rep on the same team. Only same-client teammates are shown.' },
  { icon: '⏸️', color: '#757575', title: 'Mark Unqualified', detail: 'Closes the lead as not a fit (with a reason). Hidden from active views; can be reopened from the lead detail later.' },
  { icon: '❌', color: '#EF4444', title: 'Mark Lost',   detail: 'Closes the lead/deal as lost to a competitor / no decision. Captures reason for the Lost Reasons analytics widget.' },
  { icon: '↩️', color: '#10B981', title: 'Reopen',      detail: 'Flips an Unqualified / Lost / Converted lead back to Working. Used when a closed deal comes back to life.' },
];

// KINI AI capabilities — what the AI assistant can actually do in CRM.
// Reps land on the help page wondering "what should I ask KINI?", so this
// section doubles as inspiration + a cheat-sheet.
const KINI_CAPABILITIES: Array<{ icon: string; title: string; detail: string; examples: string[] }> = [
  { icon: '🔍', title: 'Fetch your CRM data',
    detail: 'Ask in plain language; KINI runs the right query and renders cards (lead lists, deal lists, summaries).',
    examples: [
      '"Show my top 5 hottest leads"',
      '"Which deals are stuck more than 14 days?"',
      '"List Mumbai contacts who have not been called in 30 days"',
      '"How many leads did Ramesh add this week?"',
    ]},
  { icon: '✍️', title: 'Create + edit records',
    detail: 'KINI can add leads, log activities, move deal stages, and assign owners — no form-filling. Mobile numbers are validated to 10 digits, no alphabets, so dial-tos always work.',
    examples: [
      '"Add lead Rakesh from Acme Steel, mobile 98765 43210"',
      '"Log a meeting with Vikram about pricing tomorrow 11am"',
      '"Move the Reliance deal to Negotiation"',
      '"Assign all unassigned Bangalore leads to Priya"',
    ]},
  { icon: '🎯', title: 'Score & prioritise leads',
    detail: 'AI lead scoring uses the ICP weights you configured + behavioural signals (page visits, response time, deal history).',
    examples: [
      '"Re-score this lead"',
      '"Which leads improved their score this week?"',
      '"Why is this lead a 92?"',
    ]},
  { icon: '🧭', title: 'Next-Best-Action for deals',
    detail: 'Given a deal\'s stage, last activity, and competitor profile, KINI suggests the single highest-impact next move.',
    examples: [
      '"What should I do next on the Tata deal?"',
      '"Refresh next best action for all my open deals"',
    ]},
  { icon: '📊', title: 'Win-probability prediction',
    detail: 'A model-backed probability separate from the rep\'s manual guess. Drives the Forecast chart.',
    examples: [
      '"Predict win prob for this deal"',
      '"Which Negotiation-stage deals are likely to slip?"',
    ]},
  { icon: '✉️', title: 'Draft email replies',
    detail: 'Generates context-aware follow-ups in your tone. Uses the lead/deal history as grounding so KINI doesn\'t fabricate.',
    examples: [
      '"Draft a follow-up to Acme proposal"',
      '"Write a check-in email for any lead silent > 7 days"',
    ]},
  { icon: '📝', title: 'Summarise accounts + deals',
    detail: 'One-paragraph summary of an Account or Deal — every activity, every note, every linked lead.',
    examples: [
      '"Summarise the HDFC account"',
      '"What is the history of the Hero Motocorp deal?"',
    ]},
  { icon: '🌐', title: 'Multi-language',
    detail: 'KINI replies in the language you write to it: English, हिन्दी (Devanagari), বাংলা, ଓଡ଼ିଆ, অসমীয়া. Tool calls (arguments, IDs) stay in English so data integrity is preserved.',
    examples: [
      // Hindi: "Log a meeting with Ramesh tomorrow at 11 am"
      '"रमेश के साथ कल सुबह 11 बजे मीटिंग लॉग करो"',
      // Bengali: "Show me deals closing this month"
      '"এই মাসে ক্লোজ হতে যাওয়া ডিলগুলো দেখান"',
    ]},
  { icon: '🎤', title: 'Voice in + voice out',
    detail: 'Hold the mic button on the chat widget. KINI transcribes via the browser\'s speech API and answers back if you enable Hands-Free in the header.',
    examples: [
      '"Hey KINI, log a call with Ramesh — discussed pricing, follow-up next Tuesday."',
    ]},
];

// Analytics — surfaced as a dedicated section since reps often ask
// "where do I see X?". Linked cards take them straight to each report.
const ANALYTICS: Array<{ icon: string; title: string; href: string; detail: string }> = [
  { icon: '📈', title: 'Lead Analytics',       href: '/dashboard/crm/leads/analytics',      detail: 'Lead velocity, time-to-first-touch, stuck leads, score-band conversion, territory heatmap.' },
  { icon: '🏆', title: 'Rep Leaderboard',      href: '/dashboard/crm/reports/rep-leaderboard', detail: 'Calls / meetings / wins per rep — week, month, or custom range.' },
  { icon: '🪜', title: 'Stage Funnel',         href: '/dashboard/crm/reports/stage-funnel', detail: 'How many deals pass through each stage. Spot the leaky step.' },
  { icon: '⏳', title: 'Stuck Deals',          href: '/dashboard/crm/reports/stuck-deals',  detail: 'Deals that haven\'t moved in 14+ days. Sortable by days-in-stage and amount.' },
  { icon: '⌛', title: 'Lead Aging',           href: '/dashboard/crm/reports/lead-aging',   detail: 'Days since last contact, per lead. Use it to triage which old leads to call back.' },
  { icon: '🎲', title: 'Win/Loss',             href: '/dashboard/crm/reports/win-loss',     detail: 'Win rate by stage, source, owner, and lost-reason. Drill into any segment.' },
  { icon: '🔮', title: 'Forecast',             href: '/dashboard/crm/reports/forecast',     detail: 'Weighted pipeline rolled up by month, scaled by KINI AI win probability.' },
  { icon: '⏱',  title: 'Sales Cycle',          href: '/dashboard/crm/reports/sales-cycle',  detail: 'Average days lead-to-won / lead-to-lost, segmented by source and product.' },
  { icon: '🔥', title: 'Activity Heatmap',     href: '/dashboard/crm/reports/activity-heatmap', detail: 'Calls + meetings + WhatsApp by hour-of-day and day-of-week. Plan outreach blocks.' },
  { icon: '💰', title: 'Lead Source ROI',      href: '/dashboard/crm/reports/lead-source-roi', detail: 'Cost-per-lead vs revenue closed, per source. Tells you where to spend next month.' },
  { icon: '🛠', title: 'Custom Report Builder', href: '/dashboard/crm/reports/builder',      detail: 'Drag-drop fields to build any report. Save and pin it to your dashboard.' },
];

const TIPS = [
  'Tap the phone number on any lead → both a call AND an activity land in one gesture.',
  'The KINI AI floating button (bottom-right) is your AI helper. Hold the mic for voice; toggle Hands-Free for back-and-forth conversations.',
  'Tasks on the inbox are coloured by urgency. Red = overdue. Blue = today. Pull-to-refresh on mobile.',
  'Win Probability is the KINI AI guess based on stage + age + recent activity. It updates when you log meaningful interactions.',
  'Pin any chart from Lead Analytics to your Overview so it loads alongside the stat cards every morning.',
  'Settings → Custom Fields lets you add per-entity fields AND override built-in field labels (e.g. rename "Title" to "Designation") without code.',
  'Settings → Business Type controls which fields show on lead/contact forms. B2B = company + industry first; B2C = DOB + address + consent first.',
  'Use the global Client filter (top-right) to switch context — every list, chart, and report re-scopes to the selected client.',
  'KINI AI is quota-capped per user per month; the badge on the chat header shows usage. Org-level cap is also enforced.',
  'Mobile number fields are 10-digit numeric only — no alphabets, no country code. The keypad pops up automatically on mobile.',
];

export default function CrmHelpPage() {
  const [lang, setLang] = useHelpLang();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Language picker — top of the help page, easy to find. Stored
          per-browser so each rep gets their own preference. Section
          labels + hero text re-render in the chosen language; longer
          paragraphs stay English (ask KINI AI to translate them on
          demand). */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
          🌐 {tr('Display language', lang)}
        </span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as LangCode)}
          style={{
            background: 'var(--s3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 10px', fontSize: 13,
            color: 'var(--text)', cursor: 'pointer', outline: 'none',
          }}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.native}</option>
          ))}
        </select>
      </div>

      <Hero lang={lang} />

      <Section lang={lang} label="The lead-to-deal lifecycle" sub="From first touch to closed-won (or closed-lost).">
        <div style={{
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 18,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.65,
          marginBottom: 16,
        }}>
          {tr('Every lead in Kinematic moves through a small set of statuses. Reps don’t do paperwork — they just keep the record honest by flipping the status as the relationship progresses, and the rest of the CRM (analytics, win-rate, forecasts, automations) reacts on its own.', lang)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {STAGES.map((s) => (
            <div key={s.n} style={{
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              gap: 14,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: RED,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 14, flexShrink: 0,
              }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{tr(s.title, lang)}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{tr(s.detail, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="CRM modules" sub="What lives where, and when to reach for it.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
          {MODULES.map((m) => (
            <div key={m.title} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, display: 'flex', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{tr(m.title, lang)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{tr(m.what, lang)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>{tr(m.when, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="Quick actions" sub="The buttons on a lead/contact/deal record.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {ACTIONS.map((a) => (
            <div key={a.title} style={{
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: a.color + '26',
                color: a.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>{a.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{tr(a.title, lang)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{tr(a.detail, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="Reports & analytics" sub="Every report is one click away — these are the live links.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {ANALYTICS.map((a) => (
            <a key={a.title} href={a.href} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, display: 'flex', gap: 12,
              textDecoration: 'none',
              transition: 'border-color 0.15s, transform 0.15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: BLUE + '1F',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>{a.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{tr(a.title, lang)} <span style={{ color: BLUE, fontSize: 11, fontWeight: 800 }}>→</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{tr(a.detail, lang)}</div>
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="✦ KINI AI capabilities" sub="What the AI copilot can do for you inside the CRM.">
        <div style={{
          background: `linear-gradient(135deg, ${RED}0D, #6366f10D)`,
          border: `1px solid ${RED}33`,
          borderRadius: 14,
          padding: 14,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.55,
          marginBottom: 14,
        }}>
          {tr('KINI is the AI copilot built into every CRM screen. Open it from the floating ✦ button (bottom-right) or by hitting the mic anywhere. It speaks plain English (and 4 Indian languages), and it can *act* — not just answer questions.', lang)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
          {KINI_CAPABILITIES.map((k) => (
            <div key={k.title} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: RED + '1F',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{k.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{tr(k.title, lang)}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 10 }}>{tr(k.detail, lang)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {k.examples.map((ex, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: 'var(--text)',
                    background: 'var(--s3)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '5px 9px', fontFamily: 'ui-monospace, monospace',
                  }}>{ex}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="Tips & tricks" sub="Small habits that save hours a week.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TIPS.map((t, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '8px 12px',
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{tr(t, lang)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section lang={lang} label="Need more help?">
        <div style={{
          // Neutral surface — keeps brand red exclusively for the KINI AI
          // capabilities section above and the global KINI chat affordance.
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
            {tr('For anything outside this guide — onboarding, integrations setup, custom workflows, training — reach out directly. We aim to reply within one business day.', lang)}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={`tel:${SUPPORT_PHONE_DIAL}`} style={contactBtn}>
              <span style={{ fontSize: 18 }}>📞</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>{tr('Call', lang)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_PHONE}</div>
              </div>
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Kinematic%20CRM%20support`} style={contactBtn}>
              <span style={{ fontSize: 18 }}>✉️</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>{tr('Email', lang)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_EMAIL}</div>
              </div>
            </a>
            <a href={`https://wa.me/${SUPPORT_PHONE_DIAL.replace('+', '')}`} target="_blank" rel="noopener noreferrer" style={contactBtn}>
              <span style={{ fontSize: 18 }}>💬</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>{tr('WhatsApp', lang)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_PHONE}</div>
              </div>
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Hero({ lang }: { lang: LangCode }) {
  return (
    <div style={{
      // Neutral surface — red is reserved for KINI AI elsewhere on the page.
      background: 'var(--s2)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      padding: 24,
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--s3)',
          color: BLUE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
          border: '1px solid var(--border)',
        }}>📚</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{tr('How Kinematic CRM works', lang)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{tr('Everything you need to ship deals — at a glance.', lang)}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.65 }}>
        A <strong style={{ color: 'var(--text)' }}>Lead</strong> becomes a <strong style={{ color: 'var(--text)' }}>Contact</strong> + <strong style={{ color: 'var(--text)' }}>Account</strong> when qualified. A <strong style={{ color: 'var(--text)' }}>Deal</strong> tracks the conversation about money, and an inline <strong style={{ color: BLUE }}>stage stepper</strong> on the deal detail page shows your stage progress.
        Every call, WhatsApp, meeting or note logged along the way becomes an <strong style={{ color: 'var(--text)' }}>Activity</strong> visible to the entire team.
        The whole motion is observable in <strong style={{ color: 'var(--text)' }}>Reports</strong> and assistable by <strong style={{ color: RED }}>KINI AI</strong>.
      </div>
    </div>
  );
}

function Section({ lang, label, sub, children }: { lang: LangCode; label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        // Section labels use the dim text colour now — red is for KINI AI only.
        color: 'var(--text-dim)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: sub ? 4 : 12,
      }}>{tr(label, lang)}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{tr(sub, lang)}</div>}
      {children}
    </div>
  );
}

const contactBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10,
  padding: '12px 16px',
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12,
  textDecoration: 'none', minWidth: 220,
  transition: 'transform 0.15s, border-color 0.15s',
};
