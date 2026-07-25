import type { Booking } from "@/lib/types";

/**
 * Mock bookings. NOT connected to any booking system.
 *
 * HARD RULE: every customerName must start with "Demo" and every customerEmail
 * must be on the reserved `example.com` domain (RFC 2606). No real names,
 * emails, phone numbers or addresses may ever appear here.
 * Enforced by tests/no-real-customer-data.test.ts.
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
    notes: "晴天想定のベースラインケース",
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
    notes: "しきい値直下。ルール判定とAI判定が割れるケース",
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
    notes: "降水確率75%。Medium 想定",
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
    notes: "降水確率85%。High 想定",
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
    notes: "雷雨コード検出。High 想定",
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
    notes: "台風接近＋強風。High 想定",
  },
  {
    // Open-Meteo の予報範囲は約16日先まで。上の 6 件はそれより先の日付なので
    // 必ず fixture にフォールバックする（シナリオを固定するため意図的）。
    // この 1 件だけは直近の日付にして、ライブ API 経路を実際に動かす。
    // ※ この日付を過ぎたらデモ前に更新すること。
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
    notes: "ライブ天気API検証用（Open-Meteo の予報範囲内の日付）",
  },
];

export function listBookings(): Booking[] {
  return BOOKINGS;
}

export function findBooking(bookingId: string): Booking | undefined {
  return BOOKINGS.find((b) => b.bookingId === bookingId);
}
