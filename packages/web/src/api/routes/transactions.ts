import { Hono } from "hono";
import { leases } from "./leases";
import { offers } from "./offers";
import { reservations } from "./reservations";
import { sales } from "./sales";
import { transactionDocuments } from "./transaction-documents";
import { viewings } from "./viewings";

export const transactions = new Hono()
  .route("/viewings", viewings)
  .route("/offers", offers)
  .route("/reservations", reservations)
  .route("/leases", leases)
  .route("/sales", sales)
  .route("/documents", transactionDocuments);
