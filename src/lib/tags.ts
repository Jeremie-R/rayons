import type { Tag, TagId } from './types'

export const TAG_INFO: Record<TagId, { label: string; meaning: string }> = {
  admin: { label: 'admin', meaning: 'Bills, contracts, banks, appointments: the paperwork of life.' },
  event: { label: 'event', meaning: 'Something that happens at a time: invitations, bookings, tickets, deliveries.' },
  buy: { label: 'buy', meaning: 'Orders, receipts, shipping updates and things you plan to buy.' },
  knowledge: { label: 'knowledge', meaning: 'Things to read or keep: newsletters, course material, references.' },
}

export const tagLabel = (tag: Tag) => (tag ? TAG_INFO[tag].label : 'no tag')
