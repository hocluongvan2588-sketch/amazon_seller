"use server";

/**
 * Server actions — every mutation flows through here (spec §7.4: sensitive
 * logic runs server-side; the browser never calls providers directly).
 * Actions enforce session + permission via the adapter (demo) or RLS
 * (supabase), write audit events, then revalidate the page.
 */

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import Papa from "papaparse";
import { getAdapter } from "@/lib/data/factory";
import { clearSession, getSessionUser, setDemoUser } from "@/lib/session";

function requireUser() {
  return getSessionUser().then((u) => {
    if (!u) redirect("/login");
    return u;
  });
}

function flash(path: string, message: string, ok = true): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}flash=${encodeURIComponent(message)}${sep}ok=${ok ? 1 : 0}`);
}

// ---------------------------------------------------------------------------
// Auth (demo)
// ---------------------------------------------------------------------------

export async function loginAsAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  if (userId) await setDemoUser(userId);
  redirect("/today");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Product research
// ---------------------------------------------------------------------------

export async function createOpportunityAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  try {
    const opp = await adapter.createOpportunity(
      {
        client_account_id: String(formData.get("client_account_id")),
        name: String(formData.get("name")),
        category: (formData.get("category") as string) || null,
        marketplace: (formData.get("marketplace") as string) || "US",
        target_price: formData.get("target_price") ? Number(formData.get("target_price")) : null,
      },
      user.id
    );
    revalidatePath("/research");
    flash(`/research/${opp.id}`, "Đã tạo product idea — giờ hãy thêm nguồn dữ liệu.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/research", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function addSourceAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  const file = formData.get("file") as File | null;
  try {
    await adapter.addSource(
      {
        product_opportunity_id: opportunityId,
        source_type: String(formData.get("source_type") || "url") as "file" | "url" | "manual" | "report_export",
        provider_name: String(formData.get("provider_name") || "other") as never,
        source_url: (formData.get("source_url") as string) || null,
        file_name: file?.name ?? null,
        captured_at: (formData.get("captured_at") as string) || undefined,
        metadata: file ? { size: file.size, type: file.type } : {},
      },
      user.id
    );
    if (file && file.size > 0) {
      // Parse CSV/XLSX content into competitor rows (spec §5.2 import)
      const text = await file.text();
      if (/\.csv$/i.test(file.name) || text.includes(",")) {
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        const result = await adapter.importCompetitorRows(parsed.data, opportunityId, user.id);
        revalidatePath(`/research/${opportunityId}`);
        flash(`/research/${opportunityId}`, `Đã gắn nguồn & import ${result.imported} đối thủ (bỏ qua ${result.skipped} dòng).`);
        return;
      }
    }
    revalidatePath(`/research/${opportunityId}`);
    flash(`/research/${opportunityId}`, "Đã gắn nguồn dữ liệu.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function addCompetitorAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.addCompetitors(
      [
        {
          product_opportunity_id: opportunityId,
          asin: (formData.get("asin") as string) || null,
          title: String(formData.get("title")),
          brand: (formData.get("brand") as string) || null,
          price: formData.get("price") ? Number(formData.get("price")) : null,
          rating: formData.get("rating") ? Number(formData.get("rating")) : null,
          review_count: formData.get("review_count") ? Number(formData.get("review_count")) : null,
          monthly_sales: formData.get("monthly_sales") ? Number(formData.get("monthly_sales")) : null,
        },
      ],
      user.id
    );
    revalidatePath(`/research/${opportunityId}`);
    flash(`/research/${opportunityId}`, "Đã thêm đối thủ.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function deleteCompetitorAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.deleteCompetitor(id);
    revalidatePath(`/research/${opportunityId}`);
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function addSupplierAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.addSupplier(
      {
        product_opportunity_id: opportunityId,
        supplier_name: String(formData.get("supplier_name")),
        country: (formData.get("country") as string) || null,
        moq: formData.get("moq") ? Number(formData.get("moq")) : null,
        quoted_cogs: formData.get("quoted_cogs") ? Number(formData.get("quoted_cogs")) : null,
        lead_time_days: formData.get("lead_time_days") ? Number(formData.get("lead_time_days")) : null,
        notes: (formData.get("notes") as string) || null,
      },
      user.id
    );
    revalidatePath(`/research/${opportunityId}`);
    flash(`/research/${opportunityId}`, "Đã thêm supplier.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function updateSupplierAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    const patch: Record<string, unknown> = {};
    const sampleStatus = formData.get("sample_status");
    const qualityStatus = formData.get("quality_status");
    if (sampleStatus) patch.sample_status = String(sampleStatus);
    if (qualityStatus) patch.quality_status = String(qualityStatus);
    await adapter.updateSupplier(String(formData.get("id")), patch);
    revalidatePath(`/research/${opportunityId}`);
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function addRiskAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.addRisk(
      {
        product_opportunity_id: opportunityId,
        category: String(formData.get("category") || "other"),
        description: String(formData.get("description")),
        severity: String(formData.get("severity") || "medium") as never,
        mitigation: (formData.get("mitigation") as string) || null,
      },
      user.id
    );
    revalidatePath(`/research/${opportunityId}`);
    flash(`/research/${opportunityId}`, "Đã thêm rủi ro vào checklist.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function updateRiskAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.updateRisk(String(formData.get("id")), {
      status: String(formData.get("status")) as never,
    });
    revalidatePath(`/research/${opportunityId}`);
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function runAnalysisAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  const useCase = String(formData.get("use_case")) as "market" | "review";
  try {
    const { output } = await adapter.runAnalysis(opportunityId, useCase, user.id);
    revalidatePath(`/research/${opportunityId}`);
    const anchor = useCase === "market" ? "ai-market" : "ai-review";
    flash(
      `/research/${opportunityId}`,
      output.findings.length === 0
        ? `AI: chưa đủ dữ liệu — cần: ${output.missing_data.slice(0, 2).join("; ")}`
        : `AI phân tích xong: ${output.findings.length} findings, confidence=${output.findings[0].confidence}.`,
      output.findings.length > 0
    );
    void anchor;
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function submitDecisionAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    await adapter.submitDecision(
      opportunityId,
      {
        decision: String(formData.get("decision")) as never,
        reason: String(formData.get("reason") || ""),
      },
      user.id
    );
    revalidatePath(`/research/${opportunityId}`);
    flash(`/research/${opportunityId}`, "Đã gửi decision chờ reviewer duyệt.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function convertToLaunchAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const opportunityId = String(formData.get("opportunity_id"));
  try {
    const { launchId } = await adapter.convertToLaunch(opportunityId, user.id);
    revalidatePath("/launches");
    flash(`/launches/${launchId}`, "Đã chuyển thành launch project — dữ liệu research được giữ nguyên.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/research/${opportunityId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Economics
// ---------------------------------------------------------------------------

export async function saveCostProfileAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const skuId = String(formData.get("sku_id"));
  const num = (k: string) => (formData.get(k) === "" || formData.get(k) === null ? null : Number(formData.get(k)));
  try {
    const profile = await adapter.saveCostProfile(
      {
        sku_id: skuId,
        sellingPrice: num("selling_price") ?? 0,
        cogs: num("cogs") ?? 0,
        freight: num("freight") ?? 0,
        duty: num("duty") ?? 0,
        fbaFee: num("fba_fee"),
        referralFee: num("referral_fee"),
        storageCost: num("storage_cost") ?? 0,
        adAllowance: num("ad_allowance") ?? 0,
        returnAllowance: num("return_allowance") ?? 0,
        promotionAllowance: num("promotion_allowance") ?? 0,
        otherVariableCost: num("other_variable_cost") ?? 0,
        packaging: num("packaging") ?? 0,
        inspection: num("inspection") ?? 0,
        thirdPartyLogistics: num("third_party_logistics") ?? 0,
        scenario: (String(formData.get("scenario") || "base")) as never,
      },
      user.id
    );
    revalidatePath("/economics");
    flash("/economics", `Đã lưu cost profile (${profile.scenario}). Submit để finance duyệt.`);
  } catch (e) {
    unstable_rethrow(e);
    flash("/economics", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function submitCostProfileApprovalAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  try {
    await adapter.submitCostProfileApproval(id, user.id);
    revalidatePath("/economics");
    revalidatePath("/today");
    flash("/economics", "Đã gửi cost profile chờ duyệt.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/economics", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Approvals (Today)
// ---------------------------------------------------------------------------

export async function decideApprovalAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "approved" | "rejected";
  const reason = String(formData.get("reason") || "");
  try {
    const result = await adapter.decideApproval(id, decision, reason, user.id);
    revalidatePath("/today");
    revalidatePath("/research");
    revalidatePath("/listings");
    revalidatePath("/messages");
    flash("/today", result.message, result.executed || decision === "rejected");
  } catch (e) {
    unstable_rethrow(e);
    flash("/today", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Launches & listings
// ---------------------------------------------------------------------------

export async function updateLaunchStageAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  try {
    await adapter.updateLaunchStage(id, String(formData.get("stage")) as never);
    revalidatePath(`/launches/${id}`);
    revalidatePath("/launches");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/launches/${id}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function toggleChecklistAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const launchId = String(formData.get("launch_id"));
  try {
    await adapter.toggleChecklistItem(launchId, String(formData.get("item_key")));
    revalidatePath(`/launches/${launchId}`);
  } catch (e) {
    unstable_rethrow(e);
    flash(`/launches/${launchId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function createListingVersionAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const asinId = String(formData.get("asin_id"));
  try {
    const v = await adapter.createListingVersion(
      {
        asin_id: asinId,
        title: String(formData.get("title")),
        bullets: String(formData.get("bullets") || "")
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
        description: String(formData.get("description") || ""),
        backend_terms: String(formData.get("backend_terms") || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        change_reason: (formData.get("change_reason") as string) || null,
      },
      user.id
    );
    revalidatePath("/listings");
    flash("/listings", `Đã tạo listing version ${v.version_number} (draft).`);
  } catch (e) {
    unstable_rethrow(e);
    flash("/listings", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function auditListingAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const versionId = String(formData.get("version_id"));
  const asinId = String(formData.get("asin_id"));
  try {
    await adapter.auditListing({ asin_id: asinId, version_id: versionId }, user.id);
    revalidatePath("/listings");
    flash("/listings", "AI audit xong — xem kết quả trong panel AI Audit.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/listings", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function submitListingAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("version_id"));
  try {
    await adapter.submitListingForApproval(id, user.id);
    revalidatePath("/listings");
    revalidatePath("/today");
    flash("/listings", "Đã gửi listing chờ duyệt (internal review).");
  } catch (e) {
    unstable_rethrow(e);
    flash("/listings", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function rollbackListingAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const asinId = String(formData.get("asin_id"));
  try {
    await adapter.rollbackListing(asinId, user.id);
    revalidatePath("/listings");
    flash("/listings", "Đã rollback về version published gần nhất.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/listings", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// PPC
// ---------------------------------------------------------------------------

export async function refreshRecommendationsAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const clientId = String(formData.get("client_id"));
  try {
    const recs = await adapter.refreshPpcRecommendations(clientId, user.id);
    revalidatePath("/ads");
    flash("/ads", `Rules engine: ${recs.length} recommendation(s) mới.`);
  } catch (e) {
    unstable_rethrow(e);
    flash("/ads", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function decideRecommendationAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "approved" | "rejected";
  try {
    await adapter.decideRecommendation(id, decision, user.id);
    revalidatePath("/ads");
    flash("/ads", decision === "approved" ? "Đã duyệt — có thể execute." : "Đã từ chối recommendation.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/ads", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function executeRecommendationAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  try {
    const result = await adapter.executeRecommendation(id, user.id);
    revalidatePath("/ads");
    flash("/ads", result.message, result.ok);
  } catch (e) {
    unstable_rethrow(e);
    flash("/ads", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export async function saveSnapshotAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  try {
    await adapter.saveSnapshot(
      {
        sku_id: String(formData.get("sku_id")),
        snapshot_date: String(formData.get("snapshot_date") || new Date().toISOString().slice(0, 10)),
        sellable_units: Number(formData.get("sellable_units") || 0),
        reserved_units: Number(formData.get("reserved_units") || 0),
        inbound_units: Number(formData.get("inbound_units") || 0),
        unfulfillable_units: Number(formData.get("unfulfillable_units") || 0),
        units_sold: Number(formData.get("units_sold") || 0),
        observation_days: Number(formData.get("observation_days") || 30),
      },
      user.id
    );
    revalidatePath("/inventory");
    flash("/inventory", "Đã lưu inventory snapshot (kèm timestamp & nguồn).");
  } catch (e) {
    unstable_rethrow(e);
    flash("/inventory", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function saveLeadTimeAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  try {
    await adapter.saveLeadTime(
      {
        sku_id: String(formData.get("sku_id")),
        production_lead_time_days: Number(formData.get("production_lead_time_days") || 30),
        freight_lead_time_days: Number(formData.get("freight_lead_time_days") || 35),
        customs_buffer_days: Number(formData.get("customs_buffer_days") || 5),
        safety_stock_units: Number(formData.get("safety_stock_units") || 0),
        reorder_quantity: Number(formData.get("reorder_quantity") || 0),
        route: (formData.get("route") as string) || undefined,
      },
      user.id
    );
    revalidatePath("/inventory");
    flash("/inventory", "Đã lưu lead time config.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/inventory", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function createReorderAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const skuId = String(formData.get("sku_id"));
  try {
    await adapter.createReorderRecommendation(skuId, user.id);
    revalidatePath("/inventory");
    flash("/inventory", "Đã tạo reorder recommendation (draft PO — cần duyệt, không tự đặt hàng).");
  } catch (e) {
    unstable_rethrow(e);
    flash("/inventory", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Customer service
// ---------------------------------------------------------------------------

export async function classifyThreadAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const threadId = String(formData.get("thread_id"));
  try {
    const msg = await adapter.classifyThread(threadId, user.id);
    revalidatePath(`/messages/${threadId}`);
    flash(
      `/messages/${threadId}`,
      `Phân loại xong: intent=${msg.intent}, urgency=${msg.urgency}${msg.policy_risk_level && msg.policy_risk_level !== "none" ? `, policy risk=${msg.policy_risk_level}` : ""}.`
    );
  } catch (e) {
    unstable_rethrow(e);
    flash(`/messages/${threadId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function submitReplyAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const threadId = String(formData.get("thread_id"));
  const messageId = String(formData.get("message_id"));
  try {
    await adapter.submitReplyForApproval(messageId, String(formData.get("reply") || ""), user.id);
    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/today");
    flash(`/messages/${threadId}`, "Đã gửi reply chờ reviewer duyệt — KHÔNG tự gửi trong MVP.");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/messages/${threadId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function markThreadStatusAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const threadId = String(formData.get("thread_id"));
  try {
    await adapter.markThreadStatus(threadId, String(formData.get("status")) as never);
    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/messages");
  } catch (e) {
    unstable_rethrow(e);
    flash(`/messages/${threadId}`, `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  try {
    await adapter.createTask(
      {
        client_account_id: String(formData.get("client_account_id")),
        title: String(formData.get("title")),
        description: (formData.get("description") as string) || null,
        department: ((formData.get("department") as string) || null) as never,
        assignee_id: (formData.get("assignee_id") as string) || null,
        priority: (String(formData.get("priority") || "medium")) as never,
        due_at: (formData.get("due_at") as string) || null,
      },
      user.id
    );
    revalidatePath("/tasks");
    flash("/tasks", "Đã tạo task.");
  } catch (e) {
    unstable_rethrow(e);
    flash("/tasks", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function updateTaskStatusAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const id = String(formData.get("id"));
  try {
    await adapter.updateTask(id, { status: String(formData.get("status")) as never });
    revalidatePath("/tasks");
  } catch (e) {
    unstable_rethrow(e);
    flash("/tasks", `Lỗi: ${(e as Error).message}`, false);
  }
}

export async function addCommentAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  const taskId = String(formData.get("task_id"));
  try {
    await adapter.addTaskComment(taskId, String(formData.get("body") || ""), user.id);
    revalidatePath("/tasks");
  } catch (e) {
    unstable_rethrow(e);
    flash("/tasks", `Lỗi: ${(e as Error).message}`, false);
  }
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export async function markCardReadAction(formData: FormData) {
  const user = await requireUser();
  const adapter = getAdapter();
  await adapter.markTodayCardRead(String(formData.get("card_id")), user.id);
  revalidatePath("/today");
}
