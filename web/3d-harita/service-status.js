// Metro İstanbul service notices -> line state, and travel-time estimates.
const CLOSED = /(işletmeye kapal|hizmete kapal|hattımız kapal|seferler(e)? (yapılmamaktadır|durdurul|ara veril)|hizmet verilememektedir)/i;

export function classifyStatus(text) {
  return CLOSED.test(String(text)) ? 'closed' : 'partial';
}

// statuses: [{line, text, updated}] from GetServiceStatuses (active only).
export function applyStatuses(lines, statuses, source) {
  const byLine = new Map();
  for (const s of statuses || []) {
    const ids = s.line === 'M1' ? ['M1A', 'M1B'] : [s.line];
    for (const id of ids) byLine.set(id, s);
  }
  return lines.map(line => {
    const s = byLine.get(line.id);
    if (!s) return line;
    const kind = classifyStatus(s.text);
    const alert = {kind, text: s.text, updated: s.updated, source};
    if (kind === 'closed' && line.status !== 'suspended')
      return {...line, status: 'suspended', statusLabel: 'Hizmet dışı · Metro İstanbul duyurusu', statusSource: source, serviceAlert: alert};
    return {...line, serviceAlert: alert};
  });
}

export const lineSpeed = (line, info) => info.speeds?.[line.id] ?? info.defaultSpeeds?.[line.type] ?? 35;

// legs: [{line, meters}] -> {minutes, rideMinutes, transferMinutes}
export function estimateMinutes(legs, info) {
  const ride = legs.reduce((sum, leg) => sum + leg.meters / 1000 / lineSpeed(leg.line, info) * 60, 0);
  const transfer = Math.max(0, legs.length - 1) * (info.transferMinutes ?? 5);
  return {rideMinutes: Math.round(ride), transferMinutes: transfer, minutes: Math.max(1, Math.round(ride + transfer))};
}

export function facilitiesFor(info, lineId, stationName) {
  return info.facilities?.[`${lineId}|${stationName}`] || null;
}
