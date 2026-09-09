import { describe, expect, it } from "vitest";
import {
  can,
  canApprove,
  canSeeCustomerMessages,
  canSeeFinanceData,
  ROLE_MATRIX,
} from "./permissions";
import type { SystemRole } from "./types";

describe("permission matrix (spec §3.3)", () => {
  it("admin has CRUD on all business modules", () => {
    for (const module of [
      "client_profile", "product_research", "supplier_sample", "economics",
      "listing", "ppc", "inventory_logistics", "customer_response",
      "tasks", "approvals", "reports",
    ] as const) {
      expect(can("admin", module, "create")).toBe(true);
      expect(can("admin", module, "read")).toBe(true);
      expect(can("admin", module, "update")).toBe(true);
      expect(can("admin", module, "delete")).toBe(true);
    }
  });

  it("admin can manage users; no other role can", () => {
    expect(can("admin", "user_role", "create")).toBe(true);
    expect(can("owner", "user_role", "create")).toBe(true);
    for (const role of ["account_manager", "finance", "reviewer", "viewer", "ppc_operator"] as SystemRole[]) {
      expect(can(role, "user_role", "create")).toBe(false);
    }
  });

  it("researcher can CRUD product research but not listings", () => {
    expect(can("product_research", "product_research", "create")).toBe(true);
    expect(can("product_research", "listing", "create")).toBe(false);
    expect(can("product_research", "listing", "read")).toBe(true);
  });

  it("sourcing can CRUD suppliers but only read research", () => {
    expect(can("sourcing", "supplier_sample", "delete")).toBe(true);
    expect(can("sourcing", "product_research", "delete")).toBe(false);
    expect(can("sourcing", "product_research", "update")).toBe(true);
  });

  it("content owns listings; PPC owns campaigns; inventory owns stock; CS owns messages", () => {
    expect(can("content_seo", "listing", "create")).toBe(true);
    expect(can("ppc_operator", "ppc", "create")).toBe(true);
    expect(can("inventory_logistics", "inventory_logistics", "create")).toBe(true);
    expect(can("customer_service", "customer_response", "create")).toBe(true);
    // and not each other's
    expect(can("content_seo", "ppc", "create")).toBe(false);
    expect(can("ppc_operator", "listing", "create")).toBe(false);
    expect(can("customer_service", "product_research", "read")).toBe(false);
  });

  it("finance owns economics and reports", () => {
    expect(can("finance", "economics", "create")).toBe(true);
    expect(can("finance", "reports", "create")).toBe(true);
    expect(can("finance", "ppc", "update")).toBe(false);
    expect(can("finance", "listing", "read")).toBe(false);
  });

  it("reviewer can approve on every module but cannot create", () => {
    for (const module of [
      "product_research", "supplier_sample", "economics", "listing",
      "ppc", "inventory_logistics", "customer_response", "tasks", "approvals", "reports",
    ] as const) {
      expect(canApprove("reviewer", module)).toBe(true);
      expect(can("reviewer", module, "create")).toBe(false);
    }
  });

  it("viewer is read-only everywhere and has no audit log", () => {
    for (const [module, perms] of Object.entries(ROLE_MATRIX.viewer)) {
      if (perms.includes("create")) throw new Error(`viewer can create in ${module}`);
    }
    expect(can("viewer", "product_research", "read")).toBe(true);
    expect(can("viewer", "audit_log", "read")).toBe(false);
  });

  it("everyone except viewer can read the audit log", () => {
    for (const role of Object.keys(ROLE_MATRIX) as SystemRole[]) {
      expect(can(role, "audit_log", "read")).toBe(role !== "viewer");
    }
  });

  it("finance data visibility is limited to owner/admin/finance/reviewer", () => {
    expect(canSeeFinanceData("finance")).toBe(true);
    expect(canSeeFinanceData("reviewer")).toBe(true);
    expect(canSeeFinanceData("admin")).toBe(true);
    expect(canSeeFinanceData("account_manager")).toBe(false);
    expect(canSeeFinanceData("ppc_operator")).toBe(false);
  });

  it("customer messages are limited to CS/AM/admin/owner/reviewer", () => {
    expect(canSeeCustomerMessages("customer_service")).toBe(true);
    expect(canSeeCustomerMessages("account_manager")).toBe(true);
    expect(canSeeCustomerMessages("product_research")).toBe(false);
    expect(canSeeCustomerMessages("ppc_operator")).toBe(false);
    expect(canSeeCustomerMessages("finance")).toBe(false);
  });

  it("tasks are writable by all roles except viewer and reviewer", () => {
    for (const role of Object.keys(ROLE_MATRIX) as SystemRole[]) {
      const writable = can(role, "tasks", "create");
      if (role === "viewer" || role === "reviewer") expect(writable).toBe(false);
      else expect(writable).toBe(true);
    }
  });
});
