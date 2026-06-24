/**
 * Email-template HTML sanitiser. Mirrors the backend's
 * sanitiseEmailHtml() in autoResponse.service.ts and adds a few rules
 * the backend can rely on the model not producing but a user-uploaded
 * .html file frequently carries:
 *
 *   - inline event handlers (onclick, onload, onerror, …) that fire in
 *     some webmail clients
 *   - javascript: URLs in href/src/action attributes
 *   - <noscript> blocks (often used as a JS-required fallback that
 *     bleeds prose into the email)
 *
 * The function is best-effort, not a security boundary — emails are
 * also re-rendered through the recipient's webmail client which is
 * the real sandbox. The point is to keep the body the user sees in
 * the editor identical to what arrives in the inbox, instead of full
 * of JS that vanishes silently when the recipient opens it.
 *
 * If the input is a full HTML document we extract the <body> inner
 * HTML; if it's already a fragment we sanitise in place. Returns the
 * original string when sanitising yields an empty result so the user
 * never ends up staring at a blank textarea wondering what happened.
 */
export function sanitiseEmailHtml(input: string): string {
  if (!input) return input;
  let out = input;

  // 1. If the file is a full HTML document, pull the <body> inner
  //    HTML. Whatever lives in <head>/<style>/<script> would be
  //    stripped below anyway; this just removes the wrapper noise so
  //    the editor isn't full of <!doctype>/<html>/<head>.
  const bodyMatch = out.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (bodyMatch) out = bodyMatch[1];

  // 2. Block-level JS / styling / framing tags.
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '');
  out = out.replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '');
  out = out.replace(/<object\b[\s\S]*?<\/object\s*>/gi, '');
  out = out.replace(/<embed\b[^>]*\/?>/gi, '');
  // Void-ish header tags webmail strips anyway.
  out = out.replace(/<(link|meta|base)\b[^>]*\/?>(\s*<\/\1\s*>)?/gi, '');

  // 3. PascalCase JSX-style components (TweakSection, EmailTweaks, etc.)
  //    Capital-letter tag heuristic catches them without hitting any
  //    real lowercase HTML tag.
  out = out.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*\/?>/g, '');

  // 4. React mounting glue that survived the <script> strip because
  //    the model emitted it without a wrapper tag.
  out = out.replace(/^.*ReactDOM\.createRoot[\s\S]*?(?:;|$)/gm, '');

  // 5. Orphaned closers left by previous strips.
  out = out.replace(/<\/(?:script|style|noscript|iframe|object|TweaksPanel)\s*>/gi, '');

  // 6. Inline event-handler attributes. `on` + a letter + identifier
  //    chars, optionally with whitespace, followed by a value in
  //    single quotes, double quotes, or unquoted. Strips the whole
  //    attribute.
  out = out.replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 7. javascript: URLs in href/src/action/formaction/background. Replace
  //    the value with about:blank so layout doesn't break (the user
  //    keeps the tag, just neutered).
  out = out.replace(
    /(\s(?:href|src|action|formaction|background)\s*=\s*)("|')\s*javascript:[^"']*\2/gi,
    '$1$2about:blank$2',
  );
  // Same, but for unquoted attribute values.
  out = out.replace(
    /(\s(?:href|src|action|formaction|background)\s*=\s*)javascript:[^\s>]+/gi,
    '$1about:blank',
  );

  // 8. data: URLs that carry HTML (a known XSS vector inside an
  //    iframe-allowing client). data:image/... is left alone — those
  //    are legitimate inline images.
  out = out.replace(
    /(\s(?:href|src)\s*=\s*)("|')\s*data:text\/html[^"']*\2/gi,
    '$1$2about:blank$2',
  );

  // 9. Collapse the blank-line debris the strips leave behind.
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out || input;
}
