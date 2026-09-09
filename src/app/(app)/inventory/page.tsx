import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createReorderAction, saveLeadTimeAction, saveSnapshotAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, KV, PageHeader, SeverityBadge, StatCard } from "@/components/ui";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [rows, shipments, clients] = await Promise.all([
    adapter.listInventory(),
    adapter.listShipments(),
    adapter.listClients(),
  ]);
  const canEdit = can(user.role, "inventory_logistics", "update");

  const critical = rows.filter((r) => r.severity === "critical");
  const high = rows.filter((r) => r.severity === "high");

  return (
    <div>
      <PageHeader
        title="Inventory & Logistics"
        subtitle="Mô hình nội bộ: ADS, days of supply, reorder point (spec §5.7) — không phải công thức chính thức của Amazon."
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="SKU đang track" value={rows.length} />
        <StatCard label="Stockout critical" value={critical.length} tone={critical.length > 0 ? "bad" : "good"} />
        <StatCard label="Cần reorder" value={high.length} tone={high.length > 0 ? "warn" : "good"} />
        <StatCard label="Shipment đang chạy" value={shipments.filter((s) => ["booked", "in_transit", "customs"].includes(s.status)).length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có inventory data" hint="Nhập snapshot tồn kho cho các SKU đã có launch project." />
      ) : (
        <Card className="mb-6">
          <CardTitle right={<Badge>{rows.length} SKUs</Badge>}>Stockout projection</CardTitle>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>SKU / Product</th>
                  <th className="text-right">Sellable</th>
                  <th className="text-right">ADS</th>
                  <th className="text-right">DoS</th>
                  <th className="text-right">Lead time</th>
                  <th className="text-right">Reorder point</th>
                  <th>Stockout / Replenish</th>
                  <th>Mức độ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sku.id}>
                    <td>
                      <div className="text-sm font-medium text-slate-800">{r.sku.sku}</div>
                      <div className="text-[11px] text-slate-400">
                        {r.asin.asin} · {r.product.name} · snapshot {r.snapshot.snapshot_date}
                        {r.inboundEta ? ` · inbound ETA ${r.inboundEta}` : ""}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{r.snapshot.sellable_units.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.averageDailySales.toFixed(1)}</td>
                    <td className="text-right tabular-nums">{r.daysOfSupply?.toFixed(0) ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.totalLeadTimeDays} ngày</td>
                    <td className="text-right tabular-nums">{r.reorderPoint.toLocaleString()}</td>
                    <td className="text-xs">
                      {r.projectedStockoutDate
                        ? `${r.projectedStockoutDate.toLocaleDateString("vi-VN")} / ${r.replenishmentDate.toLocaleDateString("vi-VN")}`
                        : `— / ${r.replenishmentDate.toLocaleDateString("vi-VN")}`}
                    </td>
                    <td>
                      <SeverityBadge severity={r.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {rows
              .filter((r) => ["high", "critical"].includes(r.severity))
              .map((r) => (
                <div key={r.sku.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{r.sku.sku}</span>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={r.severity} />
                      {canEdit ? (
                        <form action={createReorderAction}>
                          <input type="hidden" name="sku_id" value={r.sku.id} />
                          <button className="btn btn-secondary btn-sm">Tạo reorder draft</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{r.explanation}</p>
                </div>
              ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canEdit ? (
          <>
            <Card>
              <CardTitle>Nhập inventory snapshot</CardTitle>
              <form action={saveSnapshotAction} className="grid grid-cols-2 gap-2">
                <select name="sku_id" className="input col-span-2" required>
                  {rows.map((r) => (
                    <option key={r.sku.id} value={r.sku.id}>
                      {r.sku.sku} — {r.product.name}
                    </option>
                  ))}
                </select>
                <input name="snapshot_date" type="date" className="input" required />
                <input name="observation_days" type="number" defaultValue={30} className="input" title="Số ngày quan sát để tính ADS" />
                <input name="sellable_units" type="number" placeholder="Sellable units" required className="input" />
                <input name="reserved_units" type="number" placeholder="Reserved" className="input" />
                <input name="inbound_units" type="number" placeholder="Inbound" className="input" />
                <input name="unfulfillable_units" type="number" placeholder="Unfulfillable" className="input" />
                <input name="units_sold" type="number" placeholder="Units sold (trong khung quan sát)" required className="input col-span-2" />
                <button className="btn btn-primary btn-sm col-span-2">Lưu snapshot</button>
              </form>
            </Card>

            <Card>
              <CardTitle>Cấu hình lead time</CardTitle>
              <form action={saveLeadTimeAction} className="grid grid-cols-2 gap-2">
                <select name="sku_id" className="input col-span-2" required>
                  {rows.map((r) => (
                    <option key={r.sku.id} value={r.sku.id}>
                      {r.sku.sku} (hiện tại: {r.totalLeadTimeDays} ngày tổng)
                    </option>
                  ))}
                </select>
                <input name="production_lead_time_days" type="number" defaultValue={30} placeholder="Production (ngày)" className="input" />
                <input name="freight_lead_time_days" type="number" defaultValue={35} placeholder="Freight (ngày)" className="input" />
                <input name="customs_buffer_days" type="number" defaultValue={5} placeholder="Customs buffer" className="input" />
                <input name="safety_stock_units" type="number" defaultValue={100} placeholder="Safety stock" className="input" />
                <input name="reorder_quantity" type="number" defaultValue={500} placeholder="Reorder quantity" className="input" />
                <input name="route" placeholder="Tuyến đường (VD: VN → US sea)" className="input" />
                <button className="btn btn-primary btn-sm col-span-2">Lưu lead time</button>
              </form>
            </Card>
          </>
        ) : null}

        <Card className={canEdit ? "lg:col-span-2" : ""}>
          <CardTitle right={<Badge>{shipments.length}</Badge>}>Shipments</CardTitle>
          {shipments.length === 0 ? (
            <EmptyState title="Chưa có shipment" />
          ) : (
            <div className="space-y-2">
              {shipments.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{s.shipment_reference}</span>
                    <Badge tone={s.status === "in_transit" ? "blue" : s.status === "checked_in" ? "green" : "slate"}>
                      {s.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
                    <KV label="Tuyến">{s.origin} → {s.destination}</KV>
                    <KV label="Số lượng">{s.quantity.toLocaleString()}</KV>
                    <KV label="ETA">{s.eta ?? "—"}</KV>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            {clients.length} clients trong phạm vi · inventory data luôn kèm timestamp &amp; source (acceptance §5.7).
          </p>
        </Card>
      </div>
    </div>
  );
}
