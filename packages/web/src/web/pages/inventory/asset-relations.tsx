import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type ContactOption = { id: string; displayName: string };
type Ownership = {
  id: string;
  ownerContactId: string;
  ownershipPercentage: number;
  effectiveFrom: number;
  effectiveTo: number | null;
};
type Listing = {
  id: string;
  principalContactId: string;
  agreementType: "sale" | "rent" | "both";
  status: "draft" | "active" | "expired" | "terminated";
  startsAt: number;
  endsAt: number | null;
};

type AssetRelationsProps = {
  propertyId: string;
  contacts: ContactOption[];
  ownership: Ownership[];
  listings: Listing[];
};

export function AssetRelations({ propertyId, contacts, ownership, listings }: AssetRelationsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ownerContactId, setOwnerContactId] = useState("");
  const [ownershipPercentage, setOwnershipPercentage] = useState("");
  const [principalContactId, setPrincipalContactId] = useState("");
  const [agreementType, setAgreementType] = useState<"sale" | "rent" | "both">("sale");
  const [listingStatus, setListingStatus] = useState<"draft" | "active">("draft");

  const activeOwnership = ownership.filter((item) => item.effectiveTo == null);
  const ownershipTotal = activeOwnership.reduce((sum, item) => sum + item.ownershipPercentage, 0);
  const contactName = (id: string) => contacts.find((item) => item.id === id)?.displayName ?? id;

  const addOwnership = useMutation({
    mutationFn: async () => {
      const response = await api.inventory.ownership.$post({
        json: {
          ownerContactId,
          propertyId,
          ownershipPercentage: Number(ownershipPercentage),
          effectiveFrom: Date.now(),
        },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not add ownership");
    },
    onSuccess: () => {
      setOwnerContactId("");
      setOwnershipPercentage("");
      void queryClient.invalidateQueries({ queryKey: ["inventory-property", propertyId] });
    },
  });

  const addListing = useMutation({
    mutationFn: async () => {
      const response = await api.inventory.listings.$post({
        json: {
          principalContactId,
          propertyId,
          agreementType,
          status: listingStatus,
          startsAt: Date.now(),
        },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not create listing agreement");
    },
    onSuccess: () => {
      setPrincipalContactId("");
      void queryClient.invalidateQueries({ queryKey: ["inventory-property", propertyId] });
    },
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-gray-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{t("inventory.ownership", "Ownership")}</h3>
            <p className="text-xs text-gray-400">{ownershipTotal.toFixed(2)}% {t("inventory.allocated", "allocated")}</p>
          </div>
          <span className={`badge ${ownershipTotal > 100 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{Math.max(0, 100 - ownershipTotal).toFixed(2)}% {t("inventory.remaining", "remaining")}</span>
        </div>
        <div className="space-y-2">
          {activeOwnership.length === 0 ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-400">{t("inventory.no_owners", "No active ownership recorded.")}</p> : activeOwnership.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="truncate">{contactName(item.ownerContactId)}</span>
              <strong>{item.ownershipPercentage}%</strong>
            </div>
          ))}
        </div>
        <form className="mt-4 space-y-2 border-t border-gray-100 pt-4" onSubmit={(event) => { event.preventDefault(); addOwnership.mutate(); }}>
          <select className="select" required aria-label={t("inventory.owner_contact", "Owner contact")} value={ownerContactId} onChange={(event) => setOwnerContactId(event.target.value)}><option value="">{t("inventory.select_owner", "Select owner contact")}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select>
          <div className="flex gap-2"><input className="input" required type="number" min="0.01" max="100" step="0.01" placeholder={t("inventory.share", "Ownership %")} value={ownershipPercentage} onChange={(event) => setOwnershipPercentage(event.target.value)} /><button type="submit" className="btn-primary flex items-center gap-1" disabled={addOwnership.isPending}><Plus size={14} /> {t("common.add", "Add")}</button></div>
          {addOwnership.error && <p className="text-xs text-red-500">{addOwnership.error.message}</p>}
        </form>
      </section>

      <section className="rounded-xl border border-gray-100 p-4">
        <div className="mb-3">
          <h3 className="font-semibold">{t("inventory.listing_agreements", "Listing agreements")}</h3>
          <p className="text-xs text-gray-400">{t("inventory.listing_help", "Track the principal and marketing authority for this asset.")}</p>
        </div>
        <div className="space-y-2">
          {listings.length === 0 ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-400">{t("inventory.no_listings", "No listing agreements recorded.")}</p> : listings.map((item) => (
            <div key={item.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="truncate">{contactName(item.principalContactId)}</span><span className="badge bg-blue-100 text-blue-700">{item.status}</span></div>
              <p className="mt-1 text-xs text-gray-400">{item.agreementType} · {new Date(item.startsAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
        <form className="mt-4 space-y-2 border-t border-gray-100 pt-4" onSubmit={(event) => { event.preventDefault(); addListing.mutate(); }}>
          <select className="select" required aria-label={t("inventory.principal_contact", "Principal contact")} value={principalContactId} onChange={(event) => setPrincipalContactId(event.target.value)}><option value="">{t("inventory.select_principal", "Select principal contact")}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select>
          <div className="grid grid-cols-2 gap-2"><select className="select" value={agreementType} onChange={(event) => setAgreementType(event.target.value as typeof agreementType)}><option value="sale">sale</option><option value="rent">rent</option><option value="both">both</option></select><select className="select" value={listingStatus} onChange={(event) => setListingStatus(event.target.value as typeof listingStatus)}><option value="draft">draft</option><option value="active">active</option></select></div>
          <button type="submit" className="btn-primary flex w-full items-center justify-center gap-1" disabled={addListing.isPending}><Plus size={14} /> {t("inventory.add_listing", "Add listing agreement")}</button>
          {addListing.error && <p className="text-xs text-red-500">{addListing.error.message}</p>}
        </form>
      </section>
    </div>
  );
}
