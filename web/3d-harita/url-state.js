// Shareable view state: ?line=M4, ?from=Kadıköy&to=Taksim, &yeralti=1.
const KEYS = ['line', 'from', 'to', 'yeralti'];
const clean = v => (typeof v === 'string' && v.trim() && v.length <= 80 ? v.trim() : null);

export function readUrlState(href) {
  const q = new URL(href).searchParams;
  const from = clean(q.get('from')), to = clean(q.get('to'));
  const lineRaw = clean(q.get('line'));
  const line = lineRaw && /^[A-Z0-9-]{1,12}$/.test(lineRaw) ? lineRaw : null;
  const route = Boolean(from && to);
  return {mode: route ? 'route' : 'lines', from: route ? from : null, to: route ? to : null, line: route ? null : line, underground: q.get('yeralti') === '1'};
}

export function writeUrlState(href, {line, from, to, underground} = {}) {
  const url = new URL(href);
  for (const k of KEYS) url.searchParams.delete(k);
  if (from && to) { url.searchParams.set('from', from); url.searchParams.set('to', to); }
  else if (line) url.searchParams.set('line', line);
  if (underground) url.searchParams.set('yeralti', '1');
  return url.href;
}
