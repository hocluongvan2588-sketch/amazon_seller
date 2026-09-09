import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can, canApprove } from "@/lib/permissions";
import {
  auditListingAction,
  createListingVersionAction,
  rollbackListingAction,
  submitListingAction,
} from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import type { ListingVersion } from "@/lib/types";

export const metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<ListingVersion["status"], "slate" | "amber" | "blue" | "green" | "red" | "violet"> = {
  draft: "slate",
  internal_review: "amber",
  client_review: "amber",
  approved: "blue",
  ready_to_publish: "violet",
  published: "green",
  post_launch_review: "blue",
  rejected: "red",
};

const AUDIT_RUN_USE_CASE = "listing_audit";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const listings = await adapter.listListings();
  const aiRuns = await adapter.listAiRuns(undefined, 100);
  const canCreate = can(user.role, "listing", "create");
  const canReview = canApprove(user.role, "listing");

  return (
    <div>
      <PageHeader
        title="Listings"
        subtitle="Version history + AI audit + approval workflow (spec §5.5). Không bao giờ sửa mất version cũ — mọi version có author, reviewer, lý do."
      />
      <Flash searchParams={sp} />

      {listings.length === 0 ? (
        <EmptyState title="Chưa có listing nào" hint="Listing được tạo khi opportunity chuyển thành launch project." />
      ) : (
        <div className="space-y-6">
          {listings.map(({ asin, product, versions }) => {
            const current = versions[0];
            const auditRun = aiRuns.find(
              (r) => r.use_case === AUDIT_RUN_USE_CASE && r.input_record_ids.includes(current.id)
            );
            return (
              <Card key={asin.id}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{asin.asin}</h2>
                      <Badge tone={STATUS_TONES[current.status]}>{current.status}</Badge>
                      {asin.status === "live" ? <Badge tone="green">ASIN live</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {product?.name} · {versions.length} versions · hiện tại v{current.version_number}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canCreate ? (
                      <form action={auditListingAction}>
                        <input type="hidden" name="version_id" value={current.id} />
                        <input type="hidden" name="asin_id" value={asin.id} />
                        <button className="btn btn-secondary btn-sm">AI Audit v{current.version_number}</button>
                      </form>
                    ) : null}
                    {canCreate && !["published", "ready_to_publish"].includes(current.status) ? (
                      <form action={submitListingAction}>
                        <input type="hidden" name="version_id" value={current.id} />
                        <button className="btn btn-primary btn-sm">Submit duyệt</button>
                      </form>
                    ) : null}
                    {canReview && current.status === "internal_review" ? (
                      <p className="text-xs text-slate-400">Duyệt trong Today → Approval queue</p>
                    ) : null}
                    {canReview && versions.some((v) => v.status === "published") && current.status !== "published" ? (
                      <form action={rollbackListingAction}>
                        <input type="hidden" name="asin_id" value={asin.id} />
                        <button className="btn btn-danger btn-sm">Rollback</button>
                      </form>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <CardTitle>Version history</CardTitle>
                    <div className="space-y-2">
                      {versions.map((v) => (
                        <div key={v.id} className={`rounded-lg border p-3 ${v.id === current.id ? "border-brand-200 bg-brand-50/40" : "border-slate-100"}`}>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">v{v.version_number}</span>
                            <Badge tone={STATUS_TONES[v.status]}>{v.status}</Badge>
                            <span className="text-[11px] text-slate-400">
                              {v.created_by} · {new Date(v.created_at).toLocaleDateString("vi-VN")}
                              {v.approved_by ? ` · duyệt bởi ${v.approved_by}` : ""}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{v.title}</p>
                          {v.change_reason ? (
                            <p className="mt-1 text-xs italic text-slate-400">Lý do: {v.change_reason}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {canCreate ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-brand-600">
                          + Tạo version mới (giữ nguyên version cũ)
                        </summary>
                        <form action={createListingVersionAction} className="mt-3 space-y-2">
                          <input type="hidden" name="asin_id" value={asin.id} />
                          <input name="title" required placeholder="Title (120–200 ký tự)" className="input" />
                          <textarea
                            name="bullets"
                            rows={5}
                            placeholder={"5 bullets, mỗi dòng 1 bullet\nVD: RELIEVE NECK PAIN — ergonomic contour…"}
                            className="input"
                          />
                          <textarea name="description" rows={3} placeholder="Description" className="input" />
                          <input name="backend_terms" placeholder="Backend terms, phân cách bằng dấu phẩy" className="input" />
                          <input name="change_reason" placeholder="Lý do thay đổi (bắt buộc)" required className="input" />
                          <button className="btn btn-secondary btn-sm">Tạo draft version</button>
                        </form>
                      </details>
                    ) : null}
                  </div>

                  <div>
                    <CardTitle right={auditRun ? <Badge tone="violet">{auditRun.prompt_version}</Badge> : null}>
                      AI Listing Audit — v{current.version_number}
                    </CardTitle>
                    {auditRun?.output_json ? (
                      (() => {
                        const out = auditRun.output_json as unknown as {
                          summary: string;
                          findings: { type: string; claim: string; confidence: string; impact: string }[];
                          missing_data: string[];
                        };
                        return (
                          <div>
                            <p className="mb-3 text-sm leading-relaxed text-slate-700">{out.summary}</p>
                            <div className="space-y-2">
                              {out.findings.map((f, i) => (
                                <div key={i} className="rounded-lg border border-slate-100 p-2.5">
                                  <div className="mb-1 flex items-center gap-1.5">
                                    <Badge tone={f.impact === "high" ? "red" : f.impact === "medium" ? "amber" : "slate"}>
                                      impact {f.impact}
                                    </Badge>
                                    <span className="text-[10px] text-slate-400">{f.type}</span>
                                  </div>
                                  <p className="text-xs leading-relaxed text-slate-600">{f.claim}</p>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-[10px] text-slate-400">
                              AI output luôn là DRAFT — publish cần approval (spec §5.5).
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      <EmptyState
                        title="Chưa audit version này"
                        hint="AI kiểm tra title length, bullets, repetition, unsupported claims…"
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
