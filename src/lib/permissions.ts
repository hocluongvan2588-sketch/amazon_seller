/**
 * Permission matrix — encodes spec §3.3 "Ma trận quyền theo bộ phận".
 *
 * IMPORTANT (spec §3.4): frontend permissions are UX hints only. Real security
 * is enforced by Supabase RLS policies (see supabase/migrations). This module
 * must stay aligned with the SQL policies — tests cover both directions.
 */

import type { Department, SystemRole } from "./types";

export type Permission = "create" | "read" | "update" | "delete" | "approve";

export type ModuleKey =
  | "client_profile"
  | "product_research"
  | "supplier_sample"
  | "economics"
  | "listing"
  | "ppc"
  | "inventory_logistics"
  | "customer_response"
  | "tasks"
  | "approvals"
  | "reports"
  | "user_role"
  | "audit_log";

/**
 * Role → module → permissions. Mirrors the spec table:
 *  Admin CRUD everywhere; Account Manager RU on most; Research CRUD research,
 *  RU supplier; Sourcing CRUD supplier, R research; Content CRUD listing;
 *  PPC CRUD ppc; Inventory CRUD inventory; CS CRUD customer response;
 *  Finance CRUD economics/reports; Reviewer approves; Viewer read-only;
 *  Audit log readable by everyone except viewer.
 */
export const ROLE_MATRIX: Record<SystemRole, Record<ModuleKey, Permission[]>> = {
  owner: {
    client_profile: ["create", "read", "update", "delete", "approve"],
    product_research: ["create", "read", "update", "delete", "approve"],
    supplier_sample: ["create", "read", "update", "delete", "approve"],
    economics: ["create", "read", "update", "delete", "approve"],
    listing: ["create", "read", "update", "delete", "approve"],
    ppc: ["create", "read", "update", "delete", "approve"],
    inventory_logistics: ["create", "read", "update", "delete", "approve"],
    customer_response: ["create", "read", "update", "delete", "approve"],
    tasks: ["create", "read", "update", "delete", "approve"],
    approvals: ["create", "read", "update", "delete", "approve"],
    reports: ["create", "read", "update", "delete", "approve"],
    user_role: ["create", "read", "update", "delete"],
    audit_log: ["read"],
  },
  admin: {
    client_profile: ["create", "read", "update", "delete"],
    product_research: ["create", "read", "update", "delete"],
    supplier_sample: ["create", "read", "update", "delete"],
    economics: ["create", "read", "update", "delete"],
    listing: ["create", "read", "update", "delete"],
    ppc: ["create", "read", "update", "delete"],
    inventory_logistics: ["create", "read", "update", "delete"],
    customer_response: ["create", "read", "update", "delete"],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read", "update", "delete"],
    reports: ["create", "read", "update", "delete"],
    user_role: ["create", "read", "update", "delete"],
    audit_log: ["read"],
  },
  account_manager: {
    client_profile: ["read", "update"],
    product_research: ["create", "read", "update", "delete"],
    supplier_sample: ["read", "update"],
    economics: ["read"],
    listing: ["read", "update"],
    ppc: ["read", "update"],
    inventory_logistics: ["read", "update"],
    customer_response: ["read", "update"],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  product_research: {
    client_profile: ["read"],
    product_research: ["create", "read", "update", "delete"],
    supplier_sample: ["read", "update"],
    economics: ["read", "update"],
    listing: ["read"],
    ppc: ["read"],
    inventory_logistics: ["read"],
    customer_response: [],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  sourcing: {
    client_profile: ["read"],
    product_research: ["read", "update"],
    supplier_sample: ["create", "read", "update", "delete"],
    economics: ["read", "update"],
    listing: [],
    ppc: [],
    inventory_logistics: ["read"],
    customer_response: [],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  content_seo: {
    client_profile: ["read"],
    product_research: ["read"],
    supplier_sample: [],
    economics: [],
    listing: ["create", "read", "update", "delete"],
    ppc: ["read"],
    inventory_logistics: ["read"],
    customer_response: ["read"],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  ppc_operator: {
    client_profile: ["read"],
    product_research: ["read"],
    supplier_sample: [],
    economics: [],
    listing: ["read"],
    ppc: ["create", "read", "update", "delete"],
    inventory_logistics: ["read"],
    customer_response: [],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  inventory_logistics: {
    client_profile: ["read"],
    product_research: [],
    supplier_sample: ["read"],
    economics: ["read"],
    listing: ["read"],
    ppc: ["read"],
    inventory_logistics: ["create", "read", "update", "delete"],
    customer_response: [],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  customer_service: {
    client_profile: ["read"],
    product_research: [],
    supplier_sample: [],
    economics: [],
    listing: ["read"],
    ppc: [],
    inventory_logistics: ["read"],
    customer_response: ["create", "read", "update", "delete"],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["read"],
    user_role: [],
    audit_log: ["read"],
  },
  finance: {
    client_profile: ["read"],
    product_research: ["read"],
    supplier_sample: ["read"],
    economics: ["create", "read", "update", "delete"],
    listing: [],
    ppc: ["read"],
    inventory_logistics: ["read"],
    customer_response: [],
    tasks: ["create", "read", "update", "delete"],
    approvals: ["create", "read"],
    reports: ["create", "read", "update", "delete"],
    user_role: [],
    audit_log: ["read"],
  },
  reviewer: {
    client_profile: ["read"],
    product_research: ["read", "approve"],
    supplier_sample: ["read", "approve"],
    economics: ["read", "approve"],
    listing: ["read", "approve"],
    ppc: ["read", "approve"],
    inventory_logistics: ["read", "approve"],
    customer_response: ["read", "approve"],
    tasks: ["read", "approve"],
    approvals: ["read", "approve"],
    reports: ["read", "approve"],
    user_role: [],
    audit_log: ["read"],
  },
  viewer: {
    client_profile: ["read"],
    product_research: ["read"],
    supplier_sample: ["read"],
    economics: ["read"],
    listing: ["read"],
    ppc: ["read"],
    inventory_logistics: ["read"],
    customer_response: ["read"],
    tasks: ["read"],
    approvals: ["read"],
    reports: ["read"],
    user_role: [],
    audit_log: [],
  },
};

export function can(
  role: SystemRole,
  module: ModuleKey,
  permission: Permission
): boolean {
  return ROLE_MATRIX[role]?.[module]?.includes(permission) ?? false;
}

/** Reviewer roles may approve on a module. Admin/owner implicitly may too. */
export function canApprove(role: SystemRole, module: ModuleKey): boolean {
  return can(role, module, "approve") || role === "admin" || role === "owner";
}

/** Modules where finance data is visible — restricted set per spec §3.4. */
export function canSeeFinanceData(role: SystemRole): boolean {
  return ["owner", "admin", "finance", "reviewer"].includes(role);
}

/** PII/customer messages are limited to CS, AM, admin, owner, reviewer. */
export function canSeeCustomerMessages(role: SystemRole): boolean {
  return [
    "owner",
    "admin",
    "customer_service",
    "account_manager",
    "reviewer",
  ].includes(role);
}

export function canManageUsers(role: SystemRole): boolean {
  return can(role, "user_role", "create");
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  client_profile: "Hồ sơ khách hàng",
  product_research: "Product Research",
  supplier_sample: "Supplier & Sample",
  economics: "Unit Economics",
  listing: "Listing",
  ppc: "PPC",
  inventory_logistics: "Inventory & Logistics",
  customer_response: "Customer Response",
  tasks: "Tasks",
  approvals: "Approvals",
  reports: "Reports",
  user_role: "Người dùng & Vai trò",
  audit_log: "Audit Log",
};

export const ROLE_LABELS: Record<SystemRole, string> = {
  owner: "Owner",
  admin: "Admin",
  account_manager: "Account Manager",
  product_research: "Product Research",
  sourcing: "Sourcing",
  content_seo: "Content/SEO",
  ppc_operator: "PPC Operator",
  inventory_logistics: "Inventory/Logistics",
  customer_service: "Customer Service",
  finance: "Finance",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  research: "Research",
  sourcing: "Sourcing",
  content: "Content",
  ppc: "PPC",
  inventory: "Inventory",
  customer_service: "Customer Service",
  finance: "Finance",
  management: "Management",
};
