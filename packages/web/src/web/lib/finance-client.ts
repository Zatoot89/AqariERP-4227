export class FinanceRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FinanceRequestError";
    this.status = status;
  }
}

export async function financeRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/finance${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : typeof payload === "string" && payload
        ? payload
        : `Request failed with status ${response.status}`;
    throw new FinanceRequestError(message, response.status);
  }
  return payload as T;
}

export async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new FinanceRequestError(`Request failed with status ${response.status}`, response.status);
  return response.json() as Promise<T>;
}

export type FinanceContact = { id: string; displayName: string };
export type FinanceProperty = { id: string; title: string; currency: string };
export type FinanceUnit = {
  id: string;
  propertyId: string;
  label: string;
  currency: string;
  status: string;
};
export type FinanceProfile = { id: string; name: string; role: string; active: number | null };
export type FinanceSource = {
  id: string;
  number: string;
  type: "lease" | "sale";
  status: string;
  amount: number;
  currency: string;
  payerContactId: string;
  propertyId?: string | null;
  unitId?: string | null;
};

export async function loadFinanceOptions(): Promise<{
  contacts: FinanceContact[];
  properties: FinanceProperty[];
  units: FinanceUnit[];
  profiles: FinanceProfile[];
  sources: FinanceSource[];
}> {
  const [contactsPayload, propertyPayload, profilesPayload, leasePayload, salePayload] = await Promise.all([
    apiRequest<{ contacts: FinanceContact[] }>("/api/contacts?page=1&pageSize=200"),
    apiRequest<{ properties: FinanceProperty[] }>("/api/inventory/properties?page=1&pageSize=200"),
    apiRequest<{ agents: FinanceProfile[] }>("/api/agents"),
    apiRequest<{ leases: Array<{
      id: string; leaseNumber: string; status: string; rentAmount: number; currency: string;
      tenantContactId: string; unitId: string;
    }> }>("/api/transactions/leases?page=1&pageSize=200"),
    apiRequest<{ sales: Array<{
      id: string; saleNumber: string; status: string; agreedValue: number; currency: string;
      buyerContactId: string; propertyId?: string | null; unitId?: string | null;
    }> }>("/api/transactions/sales?page=1&pageSize=200"),
  ]);
  const unitGroups = await Promise.all(propertyPayload.properties.map(async (property) => {
    const payload = await apiRequest<{ units: Array<{
      id: string; propertyId: string; unitNumber: string; currency: string; status: string;
    }> }>(`/api/inventory/properties/${encodeURIComponent(property.id)}/units`);
    return payload.units.map((unit) => ({
      id: unit.id,
      propertyId: unit.propertyId,
      label: `${property.title} / ${unit.unitNumber}`,
      currency: unit.currency,
      status: unit.status,
    }));
  }));
  return {
    contacts: contactsPayload.contacts,
    properties: propertyPayload.properties,
    units: unitGroups.flat(),
    profiles: profilesPayload.agents.filter((profile) => profile.active === 1),
    sources: [
      ...leasePayload.leases.map((lease) => ({
        id: lease.id,
        number: lease.leaseNumber,
        type: "lease" as const,
        status: lease.status,
        amount: lease.rentAmount,
        currency: lease.currency,
        payerContactId: lease.tenantContactId,
        unitId: lease.unitId,
      })),
      ...salePayload.sales.map((sale) => ({
        id: sale.id,
        number: sale.saleNumber,
        type: "sale" as const,
        status: sale.status,
        amount: sale.agreedValue,
        currency: sale.currency,
        payerContactId: sale.buyerContactId,
        propertyId: sale.propertyId,
        unitId: sale.unitId,
      })),
    ],
  };
}

export function downloadFinanceCsv(type: "invoices" | "receipts" | "expenses" | "commissions") {
  window.open(`/api/finance/reports/export/${type}`, "_blank", "noopener,noreferrer");
}
