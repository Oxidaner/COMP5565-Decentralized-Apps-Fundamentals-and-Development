export const problemTypes = ["Screen", "Battery", "Software", "Other"] as const;
export const claimStatuses = ["None", "Pending", "Rejected", "Approved", "Serviced", "CancelledByTransfer"] as const;
export const serviceResults = ["None", "Repaired", "Replaced", "Refunded", "Other"] as const;

export function shortAddress(value: string): string {
  if (!value || value.length < 12) {
    return value || "—";
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDate(value: bigint | number | string): string {
  const timestamp = Number(value);
  if (!timestamp) {
    return "Not activated";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

type Warranty = {
  warrantyStart: bigint;
  warrantyEnd: bigint;
  approvedClaims: bigint;
  maxClaims: bigint;
};

export function formatWarrantyStatus(warranty: Warranty, now = Math.floor(Date.now() / 1000)): string {
  if (!warranty.warrantyStart) {
    return "Waiting for first customer acceptance";
  }
  if (now > Number(warranty.warrantyEnd)) return "Expired";
  if (warranty.approvedClaims >= warranty.maxClaims) return "Claim limit reached";
  return "Active";
}
