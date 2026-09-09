import { notFound } from "next/navigation";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can, canApprove } from "@/lib/permissions";
import { buildScenarios } from "@/lib/domain/economics";
import {
  addCompetitorAction,
  addRiskAction,
  addSourceAction,
  addSupplierAction,
  convertToLaunchAction,
  deleteCompetitorAction,
  runAnalysisAction,
  submitDecisionAction,
  updateRiskAction,
  updateSupplierAction,
} from "@/lib/actions";
import { Flash } from "@/components/Flash";
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  KV,
  Money,
  PageHeader,
  Pct,
  SectionAnchor,
  SeverityBadge,
} from "@/components/ui";
import type { EvidenceType } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVIDENCE_TONES: Record<EvidenceType, "blue" | "brand" | "violet" | "amber" | "slate"> = {
  observed: "blue",
  derived: "brand",
  ai_interpretation: "violet",
  assumption: "amber",
  verification_required: "slate",
};

const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  observed: "observed",
  derived: "derived",
  ai_interpretation: "AI diễn giải",
  assumption: "giả định",
  verification_required: "cần kiểm chứng",
};

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const detail = await adapter.getOpportunity(id);
  if (!detail) notFound();

  const { opportunity: opp, sources, competitors, reviewInsights, suppliers, risks, economics, score, client } = detail;
  const canEdit = can(user.role, "product_research", "update");
  const canSupplier = can(user.role, "supplier_sample", "update");
  const canSeeEcon = can(user.role, "economics", "read");
  const scenarios = economics ? buildScenarios(economics) : [];
  const aiRuns = (await adapter.listAiRuns(opp.client_account_id, 50)).filter((r) =>
    r.input_record_ids.some((rid) => sources.some((s) => s.id === rid) || competitors.some((c) => c.id === rid))
  );

  return (
    <div>
      <PageHeader
        title={opp.name}
        subtitle={
          <>
            {client?.name} · {opp.marketplace} · stage <strong>{opp.stage}</strong>
            {opp.decision ? ` · quyết định: ${opp.decision}` : ""} · score {score ? `${score.score}/100 (${score.version})` : "chưa chấm"}
          </>
        }
        actions={
          canEdit && ["go", "go_with_conditions"].includes(opp.decision ?? "") ? (
            <form action={convertToLaunchAction}>
              <input type="hidden" name="opportunity_id" value={opp.id} />
              <button className="btn btn-primary">Chuyển thành Launch Project →</button>
            </form>
          ) : null
        }
      />
      <Flash searchParams={sp} />

      {/* Score pillars */}
      {score ? (
        <Card className="mb-4">
          <CardTitle right={<Badge tone="brand">{score.version}</Badge>}>
            Opportunity score — 4 trụ & penalty rủi ro
          </CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {score.pillars.map((p) => (
              <div key={p.key} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-600">{p.label}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {p.points}/{p.max}
                  </span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(p.points / p.max) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">{p.explanation}</p>
              </div>
            ))}
          </div>
          {score.penalty > 0 ? (
            <p className="mt-3 text-xs text-rose-600">
              Penalty rủi ro đang mở: −{score.penalty} điểm · evidence completeness {score.evidenceCompleteness.toFixed(0)}%
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sources */}
        <SectionAnchor id="sources">
          <Card>
            <CardTitle right={<Badge>{sources.length}</Badge>}>Nguồn dữ liệu (source snapshots)</CardTitle>
            {sources.length === 0 ? (
              <EmptyState title="Chưa có nguồn" hint="Mọi kết luận phải truy được về nguồn + ngày capture (spec §5.2)." />
            ) : (
              <div className="mb-3 space-y-2">
                {sources.map((s) => {
                  const stale = Date.now() - Date.parse(s.captured_at) > 14 * 86_400_000;
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">
                            {s.file_name ?? s.provider_name}
                          </span>
                          {stale ? <Badge tone="amber">cũ &gt;14 ngày</Badge> : null}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {s.provider_name} · {s.source_type} · capture{" "}
                          {new Date(s.captured_at).toLocaleDateString("vi-VN")} · hash {s.content_hash ?? "—"}
                        </div>
                      </div>
                      {s.source_url ? (
                        <a href={s.source_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          Link
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            {canEdit ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Gắn nguồn mới (URL / file CSV)</summary>
                <form action={addSourceAction} className="mt-3 grid grid-cols-2 gap-2">
                  <input type="hidden" name="opportunity_id" value={opp.id} />
                  <select name="source_type" className="input">
                    <option value="report_export">Report export (CSV/XLSX)</option>
                    <option value="url">URL</option>
                    <option value="file">File / screenshot</option>
                    <option value="manual">Nhập tay</option>
                  </select>
                  <select name="provider_name" className="input">
                    <option value="helium_10">Helium 10</option>
                    <option value="jungle_scout">Jungle Scout</option>
                    <option value="keepa">Keepa</option>
                    <option value="sellersprite">SellerSprite</option>
                    <option value="data_dive">Data Dive</option>
                    <option value="amazon">Amazon</option>
                    <option value="google_trends">Google Trends</option>
                    <option value="other">Khác</option>
                  </select>
                  <input name="source_url" placeholder="URL nguồn (nếu có)" className="input col-span-2" />
                  <input name="captured_at" type="date" className="input" title="Ngày dữ liệu được capture ở nguồn" />
                  <input name="file" type="file" accept=".csv,.xlsx,.png,.jpg" className="input" />
                  <div className="col-span-2 flex items-center gap-2">
                    <button className="btn btn-secondary btn-sm">Gắn nguồn</button>
                    <span className="text-[11px] text-slate-400">File CSV competitor sẽ được parse & import tự động</span>
                  </div>
                </form>
              </details>
            ) : null}
          </Card>
        </SectionAnchor>

        {/* Competitors */}
        <Card>
          <CardTitle right={<Badge>{competitors.length}</Badge>}>Đối thủ (provider ESTIMATE)</CardTitle>
          {competitors.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu đối thủ" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>ASIN / Title</th>
                    <th className="text-right">Giá</th>
                    <th className="text-right">★</th>
                    <th className="text-right">Reviews</th>
                    <th className="text-right">Sales/mo*</th>
                    {canEdit ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="max-w-[220px]">
                          <div className="truncate text-sm font-medium text-slate-800">{c.title}</div>
                          <div className="text-[11px] text-slate-400">{c.asin ?? "—"} · obs {new Date(c.observed_at).toLocaleDateString("vi-VN")}</div>
                        </div>
                      </td>
                      <td className="text-right"><Money value={c.price} /></td>
                      <td className="text-right">{c.rating?.toFixed(1) ?? "—"}</td>
                      <td className="text-right tabular-nums">{c.review_count?.toLocaleString() ?? "—"}</td>
                      <td className="text-right tabular-nums text-slate-500">{c.monthly_sales?.toLocaleString() ?? "—"}</td>
                      {canEdit ? (
                        <td className="text-right">
                          <form action={deleteCompetitorAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="opportunity_id" value={opp.id} />
                            <button className="btn btn-ghost btn-sm text-rose-500">×</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-400">
                * Số liệu doanh thu là ước tính của provider (Helium 10/JS…), KHÔNG phải sales thực tế (spec §5.3).
              </p>
            </div>
          )}
          {canEdit ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Thêm đối thủ thủ công</summary>
              <form action={addCompetitorAction} className="mt-3 grid grid-cols-3 gap-2">
                <input type="hidden" name="opportunity_id" value={opp.id} />
                <input name="asin" placeholder="ASIN" className="input" />
                <input name="title" placeholder="Title" required className="input col-span-2" />
                <input name="price" type="number" step="0.01" placeholder="Giá" className="input" />
                <input name="rating" type="number" step="0.1" placeholder="Rating" className="input" />
                <input name="review_count" type="number" placeholder="Reviews" className="input" />
                <input name="monthly_sales" type="number" placeholder="Est. sales/mo" className="input" />
                <button className="btn btn-secondary btn-sm col-span-3">Thêm</button>
              </form>
            </details>
          ) : null}
        </Card>

        {/* AI market summary */}
        <SectionAnchor id="ai-market">
          <Card>
            <CardTitle right={<Badge tone="violet">heuristic-engine</Badge>}>AI Market Summary</CardTitle>
            {(() => {
              const run = aiRuns.find((r) => r.use_case === "market_summary");
              if (!run?.output_json) {
                return (
                  <EmptyState
                    title="Chưa chạy phân tích thị trường"
                    hint="AI cần tối thiểu 3 đối thủ + nguồn dữ liệu — nếu thiếu sẽ trả về danh sách data gap thay vì kết luận bừa (spec §5.3)."
                  />
                );
              }
              const out = run.output_json as unknown as {
                summary: string;
                findings: { type: EvidenceType; claim: string; evidence_ids: string[]; confidence: string; impact: string }[];
                missing_data: string[];
                risks: string[];
              };
              return (
                <div>
                  <p className="mb-3 text-sm leading-relaxed text-slate-700">{out.summary}</p>
                  <div className="space-y-2">
                    {(out.findings ?? []).map((f, i) => (
                      <div key={i} className="rounded-lg border border-slate-100 p-2.5">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={EVIDENCE_TONES[f.type]}>{EVIDENCE_LABELS[f.type]}</Badge>
                          <Badge tone={f.confidence === "high" ? "green" : f.confidence === "medium" ? "amber" : "slate"}>
                            confidence {f.confidence}
                          </Badge>
                          <Badge tone="slate">impact {f.impact}</Badge>
                          <span className="text-[10px] text-slate-400">evidence: {f.evidence_ids.join(", ").slice(0, 40)}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600">{f.claim}</p>
                      </div>
                    ))}
                  </div>
                  {out.missing_data.length > 0 ? (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3">
                      <div className="text-xs font-medium text-amber-800">Dữ liệu còn thiếu</div>
                      <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                        {(out.missing_data ?? []).map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10px] text-slate-400">
                    prompt {run.prompt_version} · model {run.model_name} · {new Date(run.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
              );
            })()}
            {canEdit ? (
              <form action={runAnalysisAction} className="mt-3">
                <input type="hidden" name="opportunity_id" value={opp.id} />
                <input type="hidden" name="use_case" value="market" />
                <button className="btn btn-secondary btn-sm">Chạy AI Market Summary</button>
              </form>
            ) : null}
          </Card>
        </SectionAnchor>

        {/* AI review mining */}
        <SectionAnchor id="ai-review">
          <Card>
            <CardTitle right={<Badge tone="violet">heuristic-engine</Badge>}>AI Review Mining</CardTitle>
            {(() => {
              const run = aiRuns.find((r) => r.use_case === "review_mining");
              if (!run?.output_json) {
                return <EmptyState title="Chưa có review insight" hint="Import review export từ Amazon rồi chạy phân tích pain-point." />;
              }
              const out = run.output_json as unknown as { summary: string; missing_data: string[] };
              return (
                <div>
                  <p className="mb-3 text-sm leading-relaxed text-slate-700">{out.summary}</p>
                  <div className="space-y-2">
                    {reviewInsights.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                        <Badge tone={i.sentiment === "negative" ? "red" : i.sentiment === "positive" ? "green" : "slate"}>
                          {i.sentiment}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800">{i.theme}</div>
                          <div className="text-[11px] text-slate-400">
                            {i.frequency} lượt · {i.evidence_count} ví dụ · confidence {i.ai_confidence}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {canEdit ? (
              <form action={runAnalysisAction} className="mt-3">
                <input type="hidden" name="opportunity_id" value={opp.id} />
                <input type="hidden" name="use_case" value="review" />
                <button className="btn btn-secondary btn-sm">Chạy AI Review Mining</button>
              </form>
            ) : null}
          </Card>
        </SectionAnchor>

        {/* Suppliers */}
        <Card>
          <CardTitle right={<Badge>{suppliers.length}</Badge>}>Supplier & Sample</CardTitle>
          {suppliers.length === 0 ? (
            <EmptyState title="Chưa có supplier" />
          ) : (
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{s.supplier_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.country}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={s.sample_status === "approved" ? "green" : s.sample_status === "rejected" ? "red" : "slate"}>
                        sample: {s.sample_status}
                      </Badge>
                      <Badge tone={s.quality_status === "passed" ? "green" : s.quality_status === "failed" ? "red" : "slate"}>
                        QC: {s.quality_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <span>MOQ {s.moq?.toLocaleString() ?? "—"}</span>
                    <span>COGS <Money value={s.quoted_cogs} /></span>
                    <span>Lead {s.lead_time_days ?? "—"} ngày</span>
                  </div>
                  {s.notes ? <p className="mt-1.5 text-xs italic text-slate-400">{s.notes}</p> : null}
                  {canSupplier ? (
                    <form action={updateSupplierAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="opportunity_id" value={opp.id} />
                      <select name="sample_status" defaultValue={s.sample_status} className="input h-8 w-40 py-0 text-xs">
                        {["not_requested", "requested", "in_production", "in_transit", "received", "approved", "rejected"].map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      <select name="quality_status" defaultValue={s.quality_status} className="input h-8 w-32 py-0 text-xs">
                        {["unknown", "pending", "passed", "failed"].map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      <button className="btn btn-secondary btn-sm">Cập nhật</button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canSupplier ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Thêm supplier</summary>
              <form action={addSupplierAction} className="mt-3 grid grid-cols-3 gap-2">
                <input type="hidden" name="opportunity_id" value={opp.id} />
                <input name="supplier_name" placeholder="Tên supplier" required className="input col-span-2" />
                <input name="country" placeholder="Quốc gia" className="input" />
                <input name="moq" type="number" placeholder="MOQ" className="input" />
                <input name="quoted_cogs" type="number" step="0.01" placeholder="COGS ($)" className="input" />
                <input name="lead_time_days" type="number" placeholder="Lead time (ngày)" className="input" />
                <input name="notes" placeholder="Ghi chú" className="input col-span-3" />
                <button className="btn btn-secondary btn-sm col-span-3">Thêm</button>
              </form>
            </details>
          ) : null}
        </Card>

        {/* Economics */}
        <Card>
          <CardTitle right={economics ? <Badge tone={buildScenarios(economics)[1].result.status === "complete" ? "green" : "amber"}>{buildScenarios(economics)[1].result.status === "complete" ? "complete" : "incomplete"}</Badge> : null}>
            Unit Economics
          </CardTitle>
          {!canSeeEcon ? (
            <EmptyState title="Không có quyền xem economics" hint="Dữ liệu finance giới hạn cho finance/admin/owner/reviewer (spec §3.4)." />
          ) : scenarios.length === 0 ? (
            <EmptyState title="Chưa có cost profile" hint="Sau khi chuyển thành launch project + SKU, finance sẽ tạo cost profile theo marketplace." />
          ) : (
            <div className="space-y-3">
              {scenarios.map((s) => (
                <div key={s.scenario} className="rounded-xl border border-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{s.label}</span>
                    {s.result.status === "incomplete" ? <Badge tone="amber">incomplete</Badge> : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Contribution/unit</div>
                      <div className={`text-sm font-semibold ${s.result.contributionProfitPerUnit! > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        <Money value={s.result.contributionProfitPerUnit} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Margin</div>
                      <div className="text-sm font-semibold text-slate-800"><Pct value={s.result.contributionMarginPct} /></div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Break-even ACOS</div>
                      <div className="text-sm font-semibold text-slate-800"><Pct value={s.result.breakEvenAcosPct} /></div>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                Công thức {scenarios[0].result.formulaVersion} · mọi giả định do người dùng chỉnh được; thiếu chi phí bắt buộc →
                gắn nhãn <em>incomplete</em> thay vì hiển thị như net profit chính xác (spec §5.4).
              </p>
            </div>
          )}
        </Card>

        {/* Risks */}
        <SectionAnchor id="risks">
          <Card>
            <CardTitle right={<Badge>{risks.length}</Badge>}>Risk checklist</CardTitle>
            {risks.length === 0 ? (
              <EmptyState title="Chưa ghi nhận rủi ro" />
            ) : (
              <div className="space-y-2">
                {risks.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2.5">
                    <SeverityBadge severity={r.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800">{r.description}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {r.category} · {r.status}
                        {r.mitigation ? ` · giảm thiểu: ${r.mitigation}` : ""}
                      </div>
                    </div>
                    {canEdit ? (
                      <form action={updateRiskAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="opportunity_id" value={opp.id} />
                        <select name="status" defaultValue={r.status} className="input h-8 w-32 py-0 text-xs">
                          {["open", "mitigated", "accepted", "unknown"].map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                        <button className="btn btn-ghost btn-sm ml-1">Lưu</button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {canEdit ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Thêm rủi ro</summary>
                <form action={addRiskAction} className="mt-3 grid grid-cols-2 gap-2">
                  <input type="hidden" name="opportunity_id" value={opp.id} />
                  <select name="category" className="input">
                    {["compliance", "quality", "competition", "seasonality", "brand", "economics", "logistics", "other"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select name="severity" className="input">
                    {["low", "medium", "high", "critical"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input name="description" placeholder="Mô tả rủi ro" required className="input col-span-2" />
                  <input name="mitigation" placeholder="Biện pháp giảm thiểu" className="input col-span-2" />
                  <button className="btn btn-secondary btn-sm col-span-2">Thêm</button>
                </form>
              </details>
            ) : null}
          </Card>
        </SectionAnchor>

        {/* Decision */}
        <Card className="border-brand-200 bg-brand-50/30">
          <CardTitle>Go / No-Go decision</CardTitle>
          {opp.decision ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={opp.decision.startsWith("go") ? "green" : opp.decision === "no_go" ? "red" : "amber"}>
                  {opp.decision.toUpperCase()}
                </Badge>
                <span className="text-xs text-slate-500">
                  duyệt bởi {opp.decided_by ?? "—"} · {opp.decided_at ? new Date(opp.decided_at).toLocaleDateString("vi-VN") : ""}
                </span>
              </div>
              <p className="text-sm text-slate-700">{opp.decision_reason}</p>
              {["go", "go_with_conditions"].includes(opp.decision) && canEdit ? (
                <p className="mt-3 text-xs text-slate-500">
                  Sẵn sàng chuyển thành launch project — dữ liệu opportunity, supplier, economics được giữ lại (một thao tác,
                  acceptance criteria §5.2).
                </p>
              ) : null}
            </div>
          ) : canEdit ? (
            <form action={submitDecisionAction} className="space-y-2">
              <input type="hidden" name="opportunity_id" value={opp.id} />
              <select name="decision" className="input">
                <option value="go">GO — đầu tư triển khai</option>
                <option value="go_with_conditions">GO WITH CONDITIONS — có điều kiện</option>
                <option value="need_more_evidence">NEED MORE EVIDENCE — cần thêm dữ liệu</option>
                <option value="no_go">NO-GO — không theo đuổi</option>
              </select>
              <textarea
                name="reason"
                required
                rows={3}
                placeholder="Lý do đề xuất (bắt buộc — lưu vào approval & audit)"
                className="input"
              />
              <button className="btn btn-primary">Gửi decision chờ reviewer duyệt</button>
              <p className="text-[11px] text-slate-500">
                Quyết định phải qua approval — không ai tự duyệt Go/No-Go của chính mình (spec §5.2).
              </p>
            </form>
          ) : (
            <EmptyState title="Chờ người phụ trách gửi decision" />
          )}
        </Card>
      </div>
    </div>
  );
}
