import { describe, expect, it } from "vitest";
import { BOOKINGS, listBookings } from "@/lib/fixtures/bookings";
import { readSourceFiles } from "./helpers";

/**
 * No real customer data may ever exist in this repository.
 * example.com / example.org / example.net are reserved by RFC 2606.
 */

const RESERVED_DOMAINS = ["example.com", "example.org", "example.net", "example.invalid"];

describe("booking fixtures contain only dummy customer data", () => {
  it("has at least one booking", () => {
    expect(listBookings().length).toBeGreaterThan(0);
  });

  it.each(BOOKINGS)("$bookingId uses a dummy name and a reserved email domain", (booking) => {
    expect(booking.customerName.startsWith("Demo")).toBe(true);
    const domain = booking.customerEmail.split("@")[1];
    expect(RESERVED_DOMAINS).toContain(domain);
  });

  it("uses demo- prefixed booking ids, not production identifiers", () => {
    for (const booking of BOOKINGS) {
      expect(booking.bookingId).toMatch(/^demo-booking-\d+$/);
    }
  });

  it("carries no phone number, address or free-text personal field", () => {
    const serialised = JSON.stringify(BOOKINGS);
    expect(serialised).not.toMatch(/0\d{1,4}-\d{1,4}-\d{4}/); // JP landline/mobile
    expect(serialised).not.toMatch(/\+81[\d-]{8,}/);
    expect(serialised).not.toMatch(/\b\d{3}-\d{4}\b/); // JP postal code
    expect(Object.keys(BOOKINGS[0])).not.toContain("phone");
    expect(Object.keys(BOOKINGS[0])).not.toContain("address");
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

  it("contains no phone number", async () => {
    const files = await readSourceFiles();
    for (const { rel, content } of files) {
      expect(content, `${rel} must not contain a phone number`).not.toMatch(
        /0\d{1,4}-\d{1,4}-\d{4}/,
      );
    }
  });
});
