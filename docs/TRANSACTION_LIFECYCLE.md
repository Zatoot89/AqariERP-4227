# Aqari ERP Transaction Lifecycle

## Goals

The transaction domain connects contacts and inventory to viewings, negotiations, reservations, leases, and sales without allowing double booking or destructive history changes.

## State machines

### Offer

```text
draft -> submitted -> under_review -> accepted
  |          |             |          -> rejected
  |          |             -> countered -> submitted
  |          -> countered
  |          -> rejected
  |          -> expired
  -> withdrawn
```

- Draft offers are editable.
- Submission freezes the current commercial terms as an offer version.
- Counteroffers create a new offer version linked to the same negotiation root.
- Acceptance requires manager/admin authorization.
- Accepted, rejected, expired, and withdrawn offers are immutable terminal states.

### Reservation

```text
draft -> active -> converted
  |         |    -> released
  |         |    -> expired
  |         -> cancelled
  -> cancelled
```

- Activation requires manager/admin authorization.
- An active reservation blocks another active reservation, lease, or active sale for the same unit.
- Conversion records the resulting lease or sale ID and never deletes the reservation.

### Lease

```text
draft -> pending_approval -> active -> renewal_due -> renewed
  |              |            |          -> expired
  |              |            -> terminated
  |              -> rejected  -> completed
  -> cancelled
```

- Approval and activation require manager/admin authorization.
- Renewal creates a new lease linked by `parent_lease_id`; the original becomes `renewed`.
- Early termination records effective date, reason, actor, and event history.
- Active/pending leases block overlapping reservations, leases, and active sales.

### Sale

```text
draft -> pending_approval -> active -> completed
  |              |            -> terminated
  |              -> rejected  -> cancelled
  -> cancelled
```

- Approval and activation require manager/admin authorization.
- Completed sales set the unit/property availability to `sold`.
- Active/pending sales block reservations and leases for the same unit.

## Authorization

- Agents may create drafts, submit offers, request approvals, record viewings, and withdraw their own non-terminal offers.
- Managers/admins may accept offers, activate reservations/contracts, approve/reject contracts, terminate contracts, complete sales, and override expiry with a required reason.
- Every transition is checked against the current state and recorded in both `transaction_state_events` and append-only `audit_logs`.

## Conflict model

A unit is considered blocked when any of the following is true:

- an `active` reservation exists and its expiry is in the future;
- a lease is `pending_approval`, `active`, or `renewal_due` and its date range overlaps the requested range;
- a sale is `pending_approval` or `active`.

Database triggers reject conflicting activation even if application validation is bypassed.

## Numbering

Agency document sequences are stored per document type and calendar year. Defaults:

- Offer: `OFR-YYYY-000001`
- Reservation: `RSV-YYYY-000001`
- Lease: `LSE-YYYY-000001`
- Sale: `SAL-YYYY-000001`
- Viewing: `VWG-YYYY-000001`

Prefixes and padding are configurable per agency. Sequence increments happen in the same transaction as record creation.

## Versioned documents

Templates are immutable versions. Editing a template creates a new version.

Generated transaction documents store:

- template ID and version;
- language and schema version;
- complete transaction/party/unit snapshot;
- rendered HTML;
- SHA-256 checksum;
- optional immutable PDF attachment ID;
- generation timestamp and actor.

Historical documents are never overwritten. Regeneration creates a new document row from the same saved snapshot/template version, making output reproducible.

## Document rendering

The platform always generates deterministic bilingual HTML from the stored snapshot. PDF rendering is performed through the configured `DOCUMENT_RENDERER_URL`, which receives the immutable HTML and returns PDF bytes. The PDF is stored as a structured attachment and linked to the document row. If no renderer is configured, the HTML remains printable and the document status is `html_ready`; it is not falsely marked as a completed PDF.

## CRM and inventory effects

- Accepted offers may create reservations.
- Converted reservations reference their lease or sale.
- Active leases set unit availability to `rented` or `occupied` according to handover state.
- Completed sales set availability to `sold`.
- Completed/activated transactions write CRM conversion events for analytics without deleting the original lead or contact history.

## Renewals and termination

- A renewal never edits the original lease dates or commercial snapshot.
- The new lease references `parent_lease_id` and copies parties/terms as a starting point.
- Termination and cancellation are state transitions with effective dates and reasons.
- Contract parties and generated documents remain attached to the historical contract.
