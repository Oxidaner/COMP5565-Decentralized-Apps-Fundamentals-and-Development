import { describe, expect, it } from "vitest";
import { formatWarrantyStatus } from "./format";

describe("AC05/AC09: warranty availability", () => {
  const warranty = { warrantyStart: 100n, warrantyEnd: 200n, approvedClaims: 0n, maxClaims: 1n };

  it("waits for the first customer acceptance", () => {
    expect(formatWarrantyStatus({ ...warranty, warrantyStart: 0n }, 150)).toBe("Waiting for first customer acceptance");
  });

  it("includes the last warranty second, as the contract does", () => {
    expect(formatWarrantyStatus(warranty, 200)).toBe("Active");
    expect(formatWarrantyStatus(warranty, 201)).toBe("Expired");
  });

  it("stops being active when the approved claim limit is reached", () => {
    expect(formatWarrantyStatus({ ...warranty, approvedClaims: 1n }, 150)).toBe("Claim limit reached");
  });
});
