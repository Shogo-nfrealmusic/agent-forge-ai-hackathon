import type { Booking } from "@/lib/types";

/**
 * Mock bookings. NOT connected to any booking system.
 *
 * HARD RULES enforced by tests/no-real-customer-data.test.ts:
 *   - customerName  must start with "Demo"
 *   - customerEmail must use a domain reserved by RFC 2606 (example.com, ...)
 *   - customerPhone must be in +1-555-01XX, the range reserved for fiction
 * No real names, emails, phone numbers or addresses may ever appear here.
 */
export const BOOKINGS: Booking[] = [
  {
    bookingId: "demo-booking-001",
    date: "2026-08-10",
    time: "13:00-14:00",
    timezone: "Asia/Tokyo",
    location: "Shibuya",
    latitude: 35.6595,
    longitude: 139.7005,
    durationMinutes: 60,
    plan: "Tokyo Quick Shoot",
    customerName: "Demo Customer",
    customerEmail: "demo@example.com",
    customerPhone: "+15550100",
    notes: "Baseline case — clear skies expected.",
  },
  {
    bookingId: "demo-booking-002",
    date: "2026-08-11",
    time: "10:00-11:30",
    timezone: "Asia/Tokyo",
    location: "Yoyogi Park",
    latitude: 35.6715,
    longitude: 139.6949,
    durationMinutes: 90,
    plan: "Family Park Session",
    customerName: "Demo Customer Two",
    customerEmail: "demo-two@example.com",
    customerPhone: "+15550101",
    notes: "Just under the threshold — the rules and the AI disagree here.",
  },
  {
    bookingId: "demo-booking-003",
    date: "2026-08-12",
    time: "16:00-17:00",
    timezone: "Asia/Tokyo",
    location: "Odaiba Seaside",
    latitude: 35.6297,
    longitude: 139.7761,
    durationMinutes: 60,
    plan: "Sunset Portrait",
    customerName: "Demo Customer Three",
    customerEmail: "demo-three@example.com",
    customerPhone: "+15550102",
    notes: "75% chance of rain — expected Medium.",
  },
  {
    bookingId: "demo-booking-004",
    date: "2026-08-13",
    time: "09:00-10:00",
    timezone: "Asia/Tokyo",
    location: "Enoshima",
    latitude: 35.2999,
    longitude: 139.4805,
    durationMinutes: 60,
    plan: "Beach Couple Shoot",
    customerName: "Demo Customer Four",
    customerEmail: "demo-four@example.com",
    customerPhone: "+15550103",
    notes: "85% chance of rain — expected High.",
  },
  {
    bookingId: "demo-booking-005",
    date: "2026-08-14",
    time: "15:00-16:00",
    timezone: "Asia/Tokyo",
    location: "Yokohama Minatomirai",
    latitude: 35.4571,
    longitude: 139.6319,
    durationMinutes: 60,
    plan: "City Walk Shoot",
    customerName: "Demo Customer Five",
    customerEmail: "demo-five@example.com",
    customerPhone: "+15550104",
    notes: "Thunderstorm code detected — expected High.",
  },
  {
    bookingId: "demo-booking-006",
    date: "2026-08-15",
    time: "11:00-12:00",
    timezone: "Asia/Tokyo",
    location: "Kamakura Beach",
    latitude: 35.3067,
    longitude: 139.5503,
    durationMinutes: 60,
    plan: "Seaside Family Shoot",
    customerName: "Demo Customer Six",
    customerEmail: "demo-six@example.com",
    customerPhone: "+15550105",
    notes: "Approaching typhoon and strong wind — expected High.",
  },
  {
    // Open-Meteo only forecasts ~16 days ahead. The six bookings above are
    // further out, so they always fall back to fixture weather — deliberate,
    // it keeps the demo scenarios fixed. This one uses a near date so the
    // live API path actually runs.
    // NOTE: refresh this date before demoing after 2026-07-28.
    bookingId: "demo-booking-007",
    date: "2026-07-28",
    time: "14:00-15:00",
    timezone: "Asia/Tokyo",
    location: "Shinjuku Gyoen",
    latitude: 35.6852,
    longitude: 139.71,
    durationMinutes: 60,
    plan: "Garden Portrait",
    customerName: "Demo Customer Seven",
    customerEmail: "demo-seven@example.com",
    customerPhone: "+15550106",
    notes: "Live weather check — date is inside the Open-Meteo forecast range.",
  },
];

export function listBookings(): Booking[] {
  return BOOKINGS;
}

export function findBooking(bookingId: string): Booking | undefined {
  return BOOKINGS.find((b) => b.bookingId === bookingId);
}
