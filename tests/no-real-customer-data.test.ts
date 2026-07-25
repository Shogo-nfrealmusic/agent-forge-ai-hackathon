import { describe, expect, it } from "vitest";
import { BOOKINGS, listBookings } from "@/lib/fixtures/bookings";
import { readSourceFiles } from "./helpers";

/**
 * No real customer data may ever exist in this repository.
 *
 *   emails — example.com / .org / .net / .invalid are reserved by RFC 2606
 *   phones — +1-555-01XX is the North American range reserved for fiction,
 *            so a number here can never route to a real person. This matters
 *            more now that the app can actually send WhatsApp messages.
 */

const RESERVED_DOMAINS = ["example.com", "example.org", "example.net", "example.invalid"];

/** +1 555 01XX — reserved for fictional use. */
const FICTIONAL_PHONE = /^\+1555 ?01\d{2}$/;

describe("booking fixtures contain only dummy customer data", () => {
  it("has at least one booking", () => {
    expect(listBookings().length).toBeGreaterThan(0);
  });

  it.each(BOOKINGS)("$bookingId uses a dummy name and a reserved email domain", (booking) => {
    expect(booking.customerName.startsWith("Demo")).toBe(true);
    const domain = booking.customerEmail.split("@")[1];
    expect(RESERVED_DOMAINS).toContain(domain);
  });

  it.each(BOOKINGS)("$bookingId uses a phone number reserved for fiction", (booking) => {
    expect(
      FICTIONAL_PHONE.test(booking.customerPhone),
      `${booking.customerPhone} is not in the +1-555-01XX fictional range`,
    ).toBe(true);
  });

  it("uses a distinct dummy phone number per booking", () => {
    const phones = BOOKINGS.map((b) => b.customerPhone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it("uses demo- prefixed booking ids, not production identifiers", () => {
    for (const booking of BOOKINGS) {
      expect(booking.bookingId).toMatch(/^demo-booking-\d+$/);
    }
  });

  it("carries no address or postal code and no extra personal fields", () => {
    const serialised = JSON.stringify(BOOKINGS);
    expect(serialised).not.toMatch(/\b\d{3}-\d{4}\b/); // JP postal code
    expect(Object.keys(BOOKINGS[0])).not.toContain("address");
    expect(Object.keys(BOOKINGS[0])).not.toContain("creditCard");
    expect(Object.keys(BOOKINGS[0])).not.toContain("dateOfBirth");
  });
});

describe("the whole source tree is free of real contact details", () => {
  it("contains no email address outside the reserved demo domains", async () => {
    const files = await readSourceFiles();
    for (const { rel, content } of files) {
      const emails = content.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
      for (const email of emails) {
        const domain = email.split("@")[1].replace(/[.,)"'`]+$/, "");
        expect(
          RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)),
          `${rel} contains a non-demo email address: ${email}`,
        ).toBe(true);
      }
    }
  });

  it("contains no phone number outside the fictional range", async () => {
    const files = await readSourceFiles();
    // Any +<country><7-14 digits> literal in the source tree. The negative
    // lookahead skips placeholder notation such as "+1-555-01XX" in comments.
    const e164 = /\+\d[\d\s-]{6,17}\d(?![\dXx])/g;
    // The Twilio sandbox sender is a documented test number, not a person.
    const ALLOWED = new Set(["+14155238886"]);

    for (const { rel, content } of files) {
      for (const raw of content.match(e164) ?? []) {
        const candidate = raw.replace(/[\s-]/g, "");
        if (ALLOWED.has(candidate)) continue;
        // Fewer than 7 digits cannot be a dialable number — it is a fragment.
        if (candidate.replace(/\D/g, "").length < 7) continue;
        expect(
          FICTIONAL_PHONE.test(candidate),
          `${rel} contains a phone number outside the fictional range: ${raw}`,
        ).toBe(true);
      }
    }
  });

  it("contains no Japanese-format landline or mobile number", async () => {
    const files = await readSourceFiles();
    for (const { rel, content } of files) {
      expect(content, `${rel} must not contain a phone number`).not.toMatch(
        /0\d{1,4}-\d{1,4}-\d{4}/,
      );
    }
  });
});
