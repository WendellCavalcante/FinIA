// Utilidades de data, moeda, cores do calendário e geração de PIX (BR Code)

export const pad = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const diffDays = (aISO, bISO) => Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000);
export const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtBR = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export const uid = () => Math.random().toString(36).slice(2, 10);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const COLOR_LABEL = {
  red: 'Saída paga',
  yellow: 'A vencer (próx. 15 dias)',
  green: 'Entrada recebida',
  blue: 'Agendado / futuro confirmado',
};
export const COLOR_EMOJI = { red: '🔴', yellow: '🟡', green: '🟢', blue: '🔵' };

/**
 * Regra de cores do calendário (Módulo 2):
 *  🔴 saída paga | 🟢 entrada recebida
 *  🟡 pendente com vencimento em até 15 dias (ou atrasado)
 *  🔵 agendado confirmado ou pendente além de 15 dias
 */
export function colorOf(t, refISO = toISO(today())) {
  if (t.status === 'pago') return t.type === 'entrada' ? 'green' : 'red';
  if (t.status === 'agendado') return 'blue';
  return diffDays(refISO, t.date) <= 15 ? 'yellow' : 'blue';
}

// ---------- PIX (BR Code EMV estático) ----------
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
const ascii = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .-]/g, '');

export function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

export function pixPayload({ key, name, city, amount, txid }) {
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const p =
    tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986') +
    tlv('54', Number(amount).toFixed(2)) + tlv('58', 'BR') +
    tlv('59', ascii(name).slice(0, 25) || 'RECEBEDOR') +
    tlv('60', ascii(city).slice(0, 15) || 'BRASIL') +
    tlv('62', tlv('05', ascii(txid).replace(/\s/g, '').slice(0, 25) || '***')) + '6304';
  return p + crc16(p);
}
