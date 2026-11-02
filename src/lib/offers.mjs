export const OFFER_STARTERS = [
  { title: 'Single-room popcorn ceiling removal', copy: 'Planning a smoother ceiling in one room? Discuss popcorn ceiling removal, surface repairs and the finish you want. Share the room size and ceiling condition so we can confirm the scope of your project.' },
  { title: 'Multiple-room popcorn ceiling removal', copy: 'Planning popcorn ceiling removal across several rooms? Tell us which rooms are included and whether you want the ceilings finished together. We can discuss access, preparation and the work needed in each room.' },
  { title: 'Popcorn removal and ceiling finishing', copy: 'Planning popcorn ceiling removal and finishing together? Discuss removal, surface repair, smoothing, primer and painting as one clearly defined project. The written quote should identify each included stage.' },
];

export function offerError(body, publishAt = null, now = new Date()) {
  if (body.topicType !== 'OFFER') return '';
  if (!body.offerTitle?.trim() || body.offerTitle.trim().length > 58) return 'Add an offer title of 58 characters or fewer.';
  for (const [label, value] of [['start', body.offerStart], ['end', body.offerEnd]]) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return `Add a valid offer ${label} date.`;
  }
  if (body.offerEnd < body.offerStart) return 'Offer end date must be on or after its start date.';
  const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  if (body.offerEnd < day(now)) return 'This offer has expired. Update its end date.';
  if (publishAt && body.offerEnd < day(new Date(publishAt))) return 'Publish this offer before its end date has passed.';
  if (body.offerRedeemUrl?.trim()) {
    try {
      const url = new URL(body.offerRedeemUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { return 'Use a valid http:// or https:// redemption link without credentials.'; }
  }
  return '';
}
