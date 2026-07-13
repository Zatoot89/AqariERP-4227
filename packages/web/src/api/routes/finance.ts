import { Hono } from "hono";
import { financeCommissions } from "./finance-commissions";
import { financeExpenses } from "./finance-expenses";
import { financeInvoices } from "./finance-invoices";
import { financeReceipts } from "./finance-receipts";
import { financeReports } from "./finance-reports";
import { financeSchedules } from "./finance-schedules";

export const finance = new Hono()
  .route("/schedules", financeSchedules)
  .route("/invoices", financeInvoices)
  .route("/receipts", financeReceipts)
  .route("/expenses", financeExpenses)
  .route("/commissions", financeCommissions)
  .route("/reports", financeReports);
