export type TransactionKind = "viewings" | "offers" | "reservations" | "leases" | "sales";

export class TransactionRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TransactionRequestError";
    this.status = status;
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === "string" && payload
          ? payload
          : `Request failed with status ${response.status}`;
    throw new TransactionRequestError(message, response.status);
  }
  return payload as T;
}

export function transactionPath(path: string): string {
  return `/api/transactions${path.startsWith("/") ? path : `/${path}`}`;
}

export function transactionRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return requestJson<T>(transactionPath(path), init);
}

export type ContactOption = {
  id: string;
  displayName: string;
};

export type PropertyOption = {
  id: string;
  title: string;
  currency: string;
};

export type UnitOption = {
  id: string;
  propertyId: string;
  label: string;
  currency: string;
  status: string;
};

export async function loadTransactionOptions(): Promise<{
  contacts: ContactOption[];
  properties: PropertyOption[];
  units: UnitOption[];
}> {
  const [contactsPayload, propertyPayload] = await Promise.all([
    requestJson<{ contacts: ContactOption[] }>("/api/contacts?page=1&pageSize=200"),
    requestJson<{ properties: PropertyOption[] }>("/api/inventory/properties?page=1&pageSize=200"),
  ]);
  const unitGroups = await Promise.all(
    propertyPayload.properties.map(async (property) => {
      const payload = await requestJson<{
        units: Array<{
          id: string;
          propertyId: string;
          unitNumber: string;
          currency: string;
          status: string;
        }>;
      }>(`/api/inventory/properties/${encodeURIComponent(property.id)}/units`);
      return payload.units.map((unit) => ({
        id: unit.id,
        propertyId: unit.propertyId,
        label: `${property.title} / ${unit.unitNumber}`,
        currency: unit.currency,
        status: unit.status,
      }));
    }),
  );
  return {
    contacts: contactsPayload.contacts,
    properties: propertyPayload.properties,
    units: unitGroups.flat(),
  };
}
