import type { FolioCategory, TaxLine } from '../../../shared/types';
import type { TaxRuleConfig } from '../../config/hotel';
import { percentOf, sum } from '../../lib/money';

export interface TaxableLine {
  category: FolioCategory;
  amountMinor: number;
}

/**
 * Applies tax rules in the configured order. A percent rule's basis is the net amount of
 * the categories it applies to, plus any earlier taxes it compounds on (e.g. UAE VAT is
 * charged on top of service charge and municipality fee). Each tax is rounded once, on
 * its total, rather than per line.
 */
export function computeTaxes(rules: TaxRuleConfig[], lines: TaxableLine[], roomNights: number): TaxLine[] {
  const out: TaxLine[] = [];
  const byCode = new Map<string, number>();

  for (const rule of rules) {
    if (rule.type === 'per_room_night') {
      if (roomNights <= 0) continue;
      const amountMinor = rule.amountMinor * roomNights;
      out.push({ kind: 'per_room_night', code: rule.code, name: rule.name, unitMinor: rule.amountMinor, roomNights, amountMinor });
      byCode.set(rule.code, amountMinor);
      continue;
    }
    const net = sum(lines.filter((l) => rule.appliesTo.includes(l.category)).map((l) => l.amountMinor));
    const compounded = sum(rule.compoundOn.map((c) => byCode.get(c) ?? 0));
    const basisMinor = net + compounded;
    if (basisMinor <= 0) continue;
    const amountMinor = percentOf(basisMinor, rule.ratePercent);
    out.push({ kind: 'percent', code: rule.code, name: rule.name, ratePercent: rule.ratePercent, basisMinor, amountMinor });
    byCode.set(rule.code, amountMinor);
  }
  return out;
}
