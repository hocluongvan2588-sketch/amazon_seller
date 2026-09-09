import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can, canSeeFinanceData } from "@/lib/permissions";
import { buildScenarios, computeEconomics, type EconomicsInputs } from "@/lib/domain/economics";
import { saveCostProfileAction, submitCostProfileApprovalAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, Money, PageHeader, Pct, StatCard } from "@/components/ui";
import type { CostProfile } from "@/lib/types";

export const metadata = { title: "Unit Economics" };
export const dynamic = "force-dynamic";

const COST_FIELDS: { name: string; label: string; required?: boolean }[] = [
  { name: "selling_price", label: "Giá bán ($)", required: true },
  { name: "cogs", label: "COGS ($)", required: true },
  { name: "freight", label: "Freight ($)" },
  { name: "duty", label: "Duty / nhập khẩu ($)" },
  { name: "fba_fee", label: "Phí FBA ($)" },
  { name: "referral_fee", label: "Referral fee ($)" },
  { name: "storage_cost", label: "Storage allocation ($)" },
  { name: "ad_allowance", label: "Advertising allowance ($)" },
  { name: "return_allowance", label: "Return allowance ($)" },
  { name: "promotion_allowance", label: "Promotion discount ($)" },
  { name: "packaging", label: "Packaging ($)" },
  { name: "inspection", label: "Inspection ($)" },
  { name: "third_party_logistics", label: "3PL ($)" },
  { name: "other_variable_cost", label: "Chi phí biến đổi khác ($)" },
];

function profileToInputs(c: CostProfile): EconomicsInputs {
  return {
    sellingPrice: Number(c.selling_price),
    cogs: Number(c.cogs),
    freight: Number(c.freight),
    duty: Number(c.duty),
    fbaFee: c.fba_fee === null ? null : Number(c.fba_fee),
    referralFee: c.referral_fee === null ? null : Number(c.referral_fee),
    storageCost: Number(c.storage_cost),
    adAllowance: Number(c.ad_allowance),
    returnAllowance: Number(c.return_allowance),
    promotionAllowance: Number(c.promotion_allowance),
    otherVariableCost: Number(c.other_variable_cost),
    packaging: Number(c.packaging),
    inspection: Number(c.inspection),
    thirdPartyLogistics: Number(c.third_party_logistics),
  };
}

export default async function EconomicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireSessionUser();

  if (!can(user.role, "economics", "read")) {
    return (
      <div>
        <PageHeader title="Unit Economics" />
        <EmptyState
          title="Không có quyền truy cập economics"
          hint="Module economics dành cho finance, research, sourcing, AM, inventory, reviewer và viewer (§3.3)."
        />
      </div>
    );
  }

  const adapter = getAdapter();
  const catalog = await adapter.listSkuCatalog();
  const canSeeNumbers = canSeeFinanceData(user.role);
  const canCreate = can(user.role, "economics", "create");

  // Chi tiết số liệu finance chỉ hiện cho finance/admin/owner/reviewer (§3.4)
  const items = canSeeNumbers
    ? await Promise.all(
        catalog.map(async (item) => ({
          ...item,
          profiles: await adapter.listCostProfiles(item.sku.id),
        }))
      )
    : [];

  const allBase = items.flatMap((i) => i.profiles.filter((p) => p.scenario === "base"));
  const approvedMargins = allBase
    .filter((p) => p.status === "approved" || p.status === "locked")
    .map((p) => computeEconomics(profileToInputs(p)).contributionMarginPct);
  const avgMargin =
    approvedMargins.length > 0
      ? approvedMargins.reduce<number>((s, m) => s + (m ?? 0), 0) / approvedMargins.length
      : null;

  return (
    <div>
      <PageHeader
        title="Unit Economics"
        subtitle="Contribution profit / margin / break-even ACOS theo SKU (spec §5.4). Công thức econ-v1, versioned — thiếu chi phí bắt buộc sẽ gắn nhãn incomplete thay vì hiển thị như net profit chính xác."
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="SKU trong danh mục" value={catalog.length} />
        <StatCard
          label="Cost profile đã duyệt"
          value={allBase.filter((p) => p.status === "approved" || p.status === "locked").length}
          tone="good"
        />
        <StatCard label="Chờ duyệt" value={allBase.filter((p) => p.status === "pending_approval").length} tone="warn" />
        <StatCard
          label="Avg margin (đã duyệt)"
          value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : "—"}
          tone={avgMargin !== null && avgMargin > 20 ? "good" : "warn"}
        />
      </div>

      {!canSeeNumbers ? (
        <Card>
          <EmptyState
            title="Chi tiết finance bị giới hạn theo quyền"
            hint="Số liệu cost profile chỉ dành cho finance, admin, owner và reviewer được ủy quyền (spec §3.4). Bạn vẫn thấy danh mục SKU và có thể làm việc ở module của mình."
          />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có SKU nào trong danh mục"
          hint="SKU được tạo khi một product opportunity GO được chuyển thành launch project. Chuyển đổi ở trang Product Research."
        />
      ) : (
        <div className="space-y-4">
          {items.map(({ sku, asin, product, profiles }) => {
            const base = profiles.filter((p) => p.scenario === "base")
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const scenarios = base ? buildScenarios(profileToInputs(base)) : [];
            return (
              <Card key={sku.id}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{sku.sku}</h2>
                      {base ? (
                        <Badge tone={base.status === "locked" ? "slate" : base.status === "approved" ? "green" : "amber"}>
                          {base.status}
                        </Badge>
                      ) : (
                        <Badge tone="red">chưa có cost profile</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {asin.asin} · {product.name} · {sku.status}
                      {sku.fnsku ? ` · FNSKU ${sku.fnsku}` : ""}
                    </p>
                  </div>
                  {base && can(user.role, "economics", "update") && base.status !== "locked" && base.status !== "approved" ? (
                    <form action={submitCostProfileApprovalAction}>
                      <input type="hidden" name="id" value={base.id} />
                      <button className="btn btn-primary btn-sm">Gửi duyệt cost profile</button>
                    </form>
                  ) : null}
                </div>

                {scenarios.length > 0 ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    {scenarios.map((s) => (
                      <div
                        key={s.scenario}
                        className={`rounded-xl border p-3 ${s.scenario === "base" ? "border-brand-200 bg-brand-50/40" : "border-slate-100"}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold capitalize text-slate-700">{s.scenario}</span>
                          {s.result.status === "incomplete" ? <Badge tone="amber">incomplete</Badge> : <Badge tone="green">complete</Badge>}
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div>
                            <div className="text-[10px] uppercase text-slate-400">CP/unit</div>
                            <div className={`text-sm font-semibold ${s.result.contributionProfitPerUnit! > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              <Money value={s.result.contributionProfitPerUnit} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-slate-400">Margin</div>
                            <div className="text-sm font-semibold text-slate-800"><Pct value={s.result.contributionMarginPct} /></div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-slate-400">BE ACOS</div>
                            <div className="text-sm font-semibold text-slate-800"><Pct value={s.result.breakEvenAcosPct} /></div>
                          </div>
                        </div>
                        {s.result.missingCosts.length > 0 ? (
                          <p className="mt-2 text-[10px] text-amber-600">Thiếu: {s.result.missingCosts.join(", ")}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {profiles.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-brand-600">
                      Lịch sử cost profile ({profiles.length})
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="table-base">
                        <thead>
                          <tr>
                            <th>Scenario</th>
                            <th className="text-right">Giá bán</th>
                            <th className="text-right">COGS</th>
                            <th className="text-right">FBA</th>
                            <th className="text-right">Referral</th>
                            <th>Hiệu lực</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profiles.map((p) => (
                            <tr key={p.id}>
                              <td className="capitalize">{p.scenario}</td>
                              <td className="text-right"><Money value={Number(p.selling_price)} /></td>
                              <td className="text-right"><Money value={Number(p.cogs)} /></td>
                              <td className="text-right"><Money value={p.fba_fee === null ? null : Number(p.fba_fee)} /></td>
                              <td className="text-right"><Money value={p.referral_fee === null ? null : Number(p.referral_fee)} /></td>
                              <td className="text-xs">{p.effective_from}{p.effective_to ? ` → ${p.effective_to}` : " → nay"}</td>
                              <td>
                                <Badge tone={p.status === "approved" || p.status === "locked" ? "green" : p.status === "pending_approval" ? "amber" : "slate"}>
                                  {p.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {canCreate ? (
        <Card className="mt-6" id="new-cost-profile">
          <CardTitle>Tạo cost profile mới</CardTitle>
          {catalog.length === 0 ? (
            <EmptyState title="Chưa có SKU" hint="Cần SKU (từ launch project) trước khi tạo cost profile." />
          ) : (
            <form action={saveCostProfileAction} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label">SKU *</label>
                <select name="sku_id" className="input" required>
                  {catalog.map(({ sku, asin, product }) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.sku} — {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Scenario</label>
                <select name="scenario" className="input">
                  <option value="base">Base</option>
                  <option value="conservative">Conservative</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div className="flex items-end">
                <span className="text-[11px] text-slate-400">1 USD / đơn vị · FX 1.0</span>
              </div>
              {COST_FIELDS.map((f) => (
                <div key={f.name}>
                  <label className="label">
                    {f.label}
                    {f.required ? " *" : ""}
                  </label>
                  <input
                    name={f.name}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required={f.required}
                    className="input"
                  />
                </div>
              ))}
              <div className="sm:col-span-4">
                <button className="btn btn-primary">Lưu cost profile (draft)</button>
                <span className="ml-3 text-xs text-slate-400">
                  Lưu xong bấm "Gửi duyệt" — finance duyệt ở Today → Approval queue (spec §5.4).
                </span>
              </div>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}
