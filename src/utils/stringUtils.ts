export function escapeExtendScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Calls that must not reach the ExtendScript engine, each replaced by
 * `__blocked(...)`. The trusted bundle defines `__blocked` to throw, and the
 * substitution keeps the opening parenthesis so the closing one still balances.
 *
 * The previous version substituted a bare block comment for the callee, so
 * `eval(1)` became that comment followed by `1)` — a syntax error. Every script
 * that tripped the filter then failed inside InDesign with "Expected: ;",
 * naming neither the offending construct nor the reason. Neutralisation has to
 * leave the code parseable so the rejection can be reported as what it is.
 */
const BLOCKED_CALLS: ReadonlyArray<readonly [RegExp, string]> = [
  // Any require, not just fs/child_process/net: there is no require in
  // ExtendScript, so a narrower list only produced false negatives.
  [/\brequire\s*\(/g, 'require'],
  [/\beval\s*\(/g, 'eval'],
  [/\bFunction\s*\(/g, 'Function'],
  [/\bexec\s*\(/g, 'exec'],
  [/\bspawn\s*\(/g, 'spawn'],
  [/\bfork\s*\(/g, 'fork'],
];

const BLOCKED_PROPERTIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bprocess\s*\.\s*exit\b/g, 'process.exit'],
  [/\bprocess\s*\.\s*kill\b/g, 'process.kill'],
];

export function sanitizeCode(code: string): string {
  let sanitized = code;
  for (const [pattern, name] of BLOCKED_CALLS) {
    sanitized = sanitized.replace(pattern, `__blocked(${JSON.stringify(name)}, `);
  }
  for (const [pattern, name] of BLOCKED_PROPERTIES) {
    sanitized = sanitized.replace(pattern, `__blocked(${JSON.stringify(name)})`);
  }
  return sanitized;
}

export function truncate(str: string, maxLen: number = 1000): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export function toUpperCaseFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
