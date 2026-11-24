// Made-up mail, events and projects for the demo. Nobody here is real. Dates are relative to
// today so the demo always looks current.

import { addDays, dateKey, startOfWeek, toLocalIso } from '../lib/dates'
import type { Account, CalendarEvent, Message, Person, Project, ProjectFile, Tag } from '../lib/types'

export const DEMO_ACCOUNT: Account = { name: 'Alex Morgan', email: 'alex@example.com' }
const me: Person = { name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email }

export interface DemoThread {
  id: string
  subject: string
  tag: Tag
  projectId: string | null
  unread: boolean
  archived: boolean
  spam: boolean
  trashed: boolean
  canUnsubscribe: boolean
  messages: Message[]
}

export interface DemoData {
  version: number
  threads: DemoThread[]
  events: CalendarEvent[]
  projects: Omit<Project, 'tags' | 'unreadCount'>[]
  files: ProjectFile[]
}

export const DEMO_VERSION = 2

const person = (name: string, email: string): Person => ({ name, email })
const solgarden = person('Solgården Homes', 'rentals@solgarden.example')
const nordhem = person('Nordhem Furniture', 'orders@nordhem.example')
const lindqvist = person('Lindqvist Living', 'delivery@lindqvist.example')
const maja = person('Maja Ek', 'maja.ek@designschool.example')
const stays = person('Stays', 'no-reply@stays.example')
const airline = person('Skylark Air', 'checkin@skylark.example')
const sam = person('Sam Lindgren', 'sam.lindgren@example.com')
const sketch = person('The Weekly Sketch', 'hello@weeklysketch.example')
const energy = person('Öresund Energy', 'billing@oresund-energy.example')
const roastery = person('Kaffe Roastery', 'shop@kafferoastery.example')
const sofia = person('Sofia Berg', 'sofia.berg@example.com')
const gym = person('Boulder Hall', 'welcome@boulderhall.example')
const tax = person('Tax Agency', 'no-reply@tax.example')
const builder = person('Hansson Builders', 'office@hanssonbuild.example')
const spammer = person('Prize Desk', 'winner@prize-desk.example')

export function createDemoData(now = new Date()): DemoData {
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const date = addDays(now, -daysAgo)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }

  let messageCount = 0
  const msg = (threadId: string, from: Person, date: string, text: string, attachments: [string, string, number][] = []): Message => {
    const id = `m${++messageCount}`
    return {
      id,
      threadId,
      from,
      to: [from.email === me.email ? sam : me],
      cc: [],
      date,
      snippet: text.replace(/\s+/g, ' ').slice(0, 140),
      text,
      attachments: attachments.map(([filename, mimeType, size], index) => ({ id: `${id}-a${index}`, messageId: id, filename, mimeType, size })),
    }
  }

  const thread = (
    id: string,
    subject: string,
    tag: Tag,
    projectId: string | null,
    flags: Partial<Pick<DemoThread, 'unread' | 'archived' | 'spam' | 'canUnsubscribe'>>,
    messages: (threadId: string) => Message[],
  ): DemoThread => ({
    id,
    subject,
    tag,
    projectId,
    unread: false,
    archived: false,
    spam: false,
    trashed: false,
    canUnsubscribe: false,
    ...flags,
    messages: messages(id),
  })

  const threads: DemoThread[] = [
    thread('t1', 'Your lease is ready to sign', 'admin', 'p-house', { unread: true }, (id) => [
      msg(id, solgarden, at(0, 8, 12), `Hi Alex,\n\nGood news: the lease for Rosengatan 12, apartment 1102, is ready. You can read it in the attached PDF and sign it online before Friday.\n\nThe key handover is booked for Tuesday. Bring an ID and the signed lease.\n\nKind regards,\nSolgården Homes`, [
        ['Lease agreement.pdf', 'application/pdf', 284_000],
      ]),
    ]),
    thread('t2', 'Your order is on its way', 'buy', 'p-house', { unread: true, canUnsubscribe: true }, (id) => [
      msg(id, nordhem, at(1, 16, 40), `Hej Alex,\n\nJust a quick message to say your order 1630372805 is being picked at our warehouse and will be handed to our delivery partner shortly.\n\nYou'll get a text with a two-hour delivery window the day before.\n\nNordhem Furniture`, [
        ['Invoice.pdf', 'application/pdf', 92_000],
        ['Assembly guide.pdf', 'application/pdf', 1_400_000],
      ]),
      msg(id, me, at(1, 18, 5), `Thanks! Could you deliver to the new address, Rosengatan 12, instead of the one on the order?\n\nAlex`),
      msg(id, nordhem, at(0, 9, 30), `Of course, we've updated the address. Delivery is planned for Friday morning.\n\nNordhem Furniture`),
    ]),
    thread('t3', 'Key handover on Tuesday', 'event', 'p-house', {}, (id) => [
      msg(id, solgarden, at(3, 11, 0), `Hi Alex,\n\nThis confirms the key handover on Tuesday at 11:00 at our office, Rosengatan 12. It takes about half an hour, then we walk through the apartment together.\n\nSee you there!`),
    ]),
    thread('t4', 'Delivery booked for next Tuesday', 'buy', 'p-house', {}, (id) => [
      msg(id, lindqvist, at(4, 14, 20), `Hello,\n\nYour sofa and two lamps will be delivered next Tuesday between 10:00 and 12:00. Reply to this email if you need to change the time.\n\nLindqvist Living`, [['Order summary.pdf', 'application/pdf', 61_000]]),
    ]),
    thread('t5', 'Week 6 reading: information architecture', 'knowledge', 'p-ux', { unread: true }, (id) => [
      msg(id, maja, at(0, 7, 45), `Hi all,\n\nFor Thursday's crit, please read the two chapters attached and bring one example of a navigation you find confusing (an app, a website, a ticket machine…).\n\nWe'll card-sort the examples together.\n\nMaja`, [
        ['IA reading - chapter 3.pdf', 'application/pdf', 2_100_000],
        ['IA reading - chapter 4.pdf', 'application/pdf', 1_800_000],
      ]),
    ]),
    thread('t6', 'Crit session moved to Thursday', 'event', 'p-ux', {}, (id) => [
      msg(id, maja, at(5, 10, 0), `Hi all, the crit session moves from Wednesday to Thursday 14:00, same room (3.14). Sorry for the shuffle!\n\nMaja`),
      msg(id, me, at(5, 10, 32), `Works for me, thanks Maja.`),
    ]),
    thread('t7', 'Booking confirmed: Casa do Rio, Lisbon', 'buy', 'p-lisbon', { canUnsubscribe: true }, (id) => [
      msg(id, stays, at(9, 21, 10), `Your stay is confirmed.\n\nCasa do Rio, Rua da Bica 31, Lisbon\nCheck-in from 15:00, check-out by 11:00\n4 nights, 2 guests\n\nYour booking reference is LX-88213.`, [['Booking.pdf', 'application/pdf', 140_000]]),
    ]),
    thread('t8', 'Check-in is open for your flight to Lisbon', 'event', 'p-lisbon', { unread: true, canUnsubscribe: true }, (id) => [
      msg(id, airline, at(0, 6, 2), `Check-in is now open for flight SK 412, Malmö → Lisbon. Choose your seats and get your boarding pass in the app or online.`),
    ]),
    thread('t9', 'Lunch next week?', null, null, { unread: true }, (id) => [
      msg(id, sam, at(0, 10, 5), `Hey! Are you free for lunch on Wednesday? I could do Saluhallen around 12:30.\n\nSam`),
    ]),
    thread('t10', 'Issue 112: drawing with constraints', 'knowledge', null, { canUnsubscribe: true }, (id) => [
      msg(id, sketch, at(2, 7, 0), `This week: why a narrower palette makes better sketches, three warm-up drills, and a reader's notebook from Gothenburg.`),
    ]),
    thread('t11', 'Your electricity bill for October', 'admin', null, {}, (id) => [
      msg(id, energy, at(6, 9, 0), `Your bill for October is ready: 412 SEK, due on the 30th. It will be paid by direct debit.`, [['Bill October.pdf', 'application/pdf', 75_000]]),
    ]),
    thread('t12', 'Receipt for your order', 'buy', null, { canUnsubscribe: true }, (id) => [
      msg(id, roastery, at(8, 13, 15), `Thanks for your order! 2 × Ethiopia Guji, 250 g. Total 298 SEK.`),
    ]),
    thread('t13', "Sofia's birthday dinner", 'event', null, { unread: true }, (id) => [
      msg(id, sofia, at(1, 20, 40), `I'm turning 35! Dinner on Saturday at 19:00, at ours. Bring nothing but yourself (and maybe dessert).\n\nSofia`),
    ]),
    thread('t14', 'Welcome to Boulder Hall', 'knowledge', null, { archived: true, canUnsubscribe: true }, (id) => [
      msg(id, gym, at(20, 12, 0), `Welcome! Your membership starts today. Intro sessions run every Monday at 18:00.`),
    ]),
    thread('t15', 'Your tax refund has been approved', 'admin', 'p-tax', { unread: true }, (id) => [
      msg(id, tax, at(40, 9, 0), `We have received your tax return for 2025.`),
      msg(id, tax, at(0, 11, 20), `Your refund of 3 420 SEK has been approved and will be paid within 5 working days.`),
    ]),
    thread('t16', 'Final invoice — kitchen', 'admin', 'p-kitchen', { archived: true }, (id) => [
      msg(id, builder, at(60, 15, 0), `Please find the final invoice for the kitchen work attached. Thank you for choosing us!`, [['Final invoice.pdf', 'application/pdf', 88_000]]),
    ]),
    thread('t17', 'Congratulations, you won a cruise', null, null, { spam: true }, (id) => [
      msg(id, spammer, at(1, 3, 3), `Claim your prize today by confirming your card details.`),
    ]),
    thread('t18', 'Moving checklist', 'admin', 'p-house', { archived: true }, (id) => [
      msg(id, me, at(12, 19, 0), `Note to self:\n- change address at the post office\n- move the internet subscription\n- book a van for Saturday`),
    ]),
  ]

  const week = startOfWeek(now)
  const timed = (dayOffset: number, from: [number, number], to: [number, number]) => {
    const start = addDays(week, dayOffset)
    start.setHours(from[0], from[1])
    const end = addDays(week, dayOffset)
    end.setHours(to[0], to[1])
    return { start: toLocalIso(start), end: toLocalIso(end), allDay: false }
  }
  const allDay = (dayOffset: number, days = 1) => ({
    start: dateKey(addDays(week, dayOffset)),
    end: dateKey(addDays(week, dayOffset + days)),
    allDay: true,
  })
  let eventCount = 0
  const event = (title: string, when: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>, tag: Tag, projectId: string | null, location = '', description = ''): CalendarEvent => {
    const id = `e${++eventCount}`
    return { id: `primary|${id}`, calendarId: 'primary', title, ...when, location, description, tag, projectId, canEdit: true }
  }

  const events: CalendarEvent[] = [
    event('Rent due', allDay(0), 'admin', 'p-house'),
    event('UX Nordic conference', allDay(1, 2), 'knowledge', 'p-ux', 'Slagthuset, Malmö'),
    event('Bank appointment', timed(0, [9, 10], [11, 0]), 'admin', 'p-house', 'Stortorget 4, 211 22 Malmö', 'Bring ID and the signed lease.'),
    event('Collect keys and first walkthrough', timed(1, [11, 0], [16, 0]), 'admin', 'p-house', 'Solgården office, Rosengatan 12, Malmö'),
    event('Lunch with Sam', timed(2, [12, 30], [13, 15]), null, null, 'Saluhallen, Malmö'),
    event('UX crit session', timed(3, [14, 0], [17, 0]), 'knowledge', 'p-ux', 'Design school, room 3.14'),
    event('Furniture delivery', timed(4, [8, 30], [13, 30]), 'buy', 'p-house', 'Home'),
    event('Climbing', timed(4, [15, 30], [17, 0]), null, null, 'Boulder Hall'),
    event("Sofia's birthday dinner", timed(5, [19, 0], [23, 0]), 'event', null, 'Sofia and Jonas, Möllevången'),
    event('Sofa delivery', timed(8, [10, 0], [12, 0]), 'buy', 'p-house', 'Home'),
    event('Flight to Lisbon', timed(10, [7, 5], [10, 40]), 'event', 'p-lisbon', 'Malmö Airport'),
    event('Lisbon', allDay(10, 4), 'event', 'p-lisbon', 'Casa do Rio, Rua da Bica 31'),
    event('Flight home', timed(14, [11, 50], [17, 25]), 'event', 'p-lisbon', 'Lisbon Airport'),
    event('Apartment viewing', timed(-9, [17, 30], [18, 0]), 'admin', 'p-house', 'Rosengatan 12, Malmö'),
    event('Dentist', timed(-3, [8, 0], [8, 45]), 'admin', null, 'Folktandvården, Malmö'),
  ]
  // A weekly class, for a few weeks around today.
  for (let w = -2; w <= 3; w++) events.push(event('UX class', timed(w * 7 + 1, [18, 0], [20, 0]), 'knowledge', 'p-ux', 'Design school'))

  const created = (daysAgo: number) => at(daysAgo, 12)
  const projects: DemoData['projects'] = [
    {
      id: 'p-house',
      name: 'House move',
      notes: `Moving to Rosengatan 12 (apt 1102) at the end of the month.\n\nStill to do: change address at the post office, move the internet subscription, book a van for Saturday, and measure the bedroom for the wardrobe.`,
      status: 'active',
      createdAt: created(30),
      updatedAt: created(0),
      archivedAt: null,
    },
    {
      id: 'p-ux',
      name: 'UX design class',
      notes: 'Evening course, Tuesdays 18:00 to 20:00. Final project: redesign the city bike app. Crit sessions on Thursdays.',
      status: 'active',
      createdAt: created(50),
      updatedAt: created(2),
      archivedAt: null,
    },
    {
      id: 'p-lisbon',
      name: 'Lisbon trip',
      notes: 'Four nights in Alfama. Ideas: Gulbenkian, LX Factory, day trip to Sintra, pastéis at Manteigaria.',
      status: 'active',
      createdAt: created(15),
      updatedAt: created(9),
      archivedAt: null,
    },
    { id: 'p-tax', name: 'Tax return 2025', notes: 'Filed in May. Waiting for the refund.', status: 'archived', createdAt: created(200), updatedAt: created(40), archivedAt: created(40) },
    { id: 'p-kitchen', name: 'Kitchen renovation', notes: 'Done! Warranty on the oven until 2028.', status: 'archived', createdAt: created(150), updatedAt: created(60), archivedAt: created(58) },
  ]

  const files: ProjectFile[] = [
    { id: 'f1', projectId: 'p-house', name: 'Contract.pdf', size: 320_000, mimeType: 'application/pdf', source: 'upload', createdAt: created(20) },
    { id: 'f2', projectId: 'p-house', name: 'Floor plan.png', size: 540_000, mimeType: 'image/png', source: 'upload', createdAt: created(18) },
    { id: 'f3', projectId: 'p-ux', name: 'Syllabus.pdf', size: 210_000, mimeType: 'application/pdf', source: 'upload', createdAt: created(50) },
  ]

  return { version: DEMO_VERSION, threads, events, projects, files }
}
