# Amazon Internal Operations Platform

Nền tảng điều phối vận hành nội bộ cho đội ngũ tìm hiểu, đánh giá, launch và vận hành shop Amazon cho khách hàng doanh nghiệp Việt — xây dựng theo **Tài liệu đặc tả dự án v1.0 (09/09/2026)**.

> **Nguyên tắc lõi** (spec §1): Công cụ bên ngoài cung cấp tín hiệu thị trường; Amazon cung cấp dữ liệu shop thực tế; hệ thống nội bộ chuẩn hóa, tính toán, quản lý quyết định và điều phối công việc; AI giải thích và hỗ trợ nhưng **không tự ý thực hiện các hành động rủi ro**.

---

## 1. Tổng quan sản phẩm

Hai lớp chính:

| Lớp | Chức năng |
| --- | --- |
| **Product Research Workspace** | Tiếp nhận idea → import dữ liệu (CSV/XLSX/URL) → phân tích nhu cầu & cạnh tranh → unit economics → risk review → **Go/No-Go** → convert thành launch project |
| **Operations Workspace** | Launch project + checklist, listing version history + AI audit, PPC recommendation queue, inventory/stockout projection, customer response có duyệt, tasks & approvals, Today dashboard, audit log |

**Không làm** (spec §2.3): không scraping Amazon làm lõi, không tự publish/tự đổi bid/tự gửi message, không xây "A10 score", không public SaaS.

## 2. Kiến trúc

```
Next.js 15 (App Router, RSC) ── Server Actions ──┐
                                                 ├── DataAdapter (contract §10)
   UI (14 routes, permission-aware)              │        ├── DemoAdapter  (in-memory, mirror schema 1:1)
                                                 │        └── SupabaseAdapter (supabase-js, RLS enforce)
   Domain engines (pure functions, tested) ──────┤
     • economics   (contribution, break-even ACOS, scenarios)
     • inventory   (ADS, DoS, reorder point, stockout projection)
     • scoring     (4-pillar opportunity score, versioned)
     • recommendations (PPC rules + guardrails)
     • priorities  (Impact × Urgency × Confidence × Scope)
                                                 │
   AI heuristic engine (evidence-based, structured output §5.3)
     market summary · review mining · listing audit · message classify
```

- **Frontend/Backend**: Next.js 15 + React 19 + TypeScript strict + Tailwind CSS
- **Database/Auth/Storage/RLS**: Supabase PostgreSQL (5 migration files trong `supabase/migrations/`)
- **AI**: heuristic engine mặc định (deterministic, có evidence/confidence/missing-data); optional OpenAI-compatible provider qua env (server-side only)
- **Test**: Vitest — 71 tests (economics formulas, inventory projection, scoring, PPC rules + guardrails, permission matrix, import normalizer, AI engine)

**Hai chế độ chạy** (tự động theo env):
- **DEMO MODE** (không cần cấu hình gì): dữ liệu mẫu in-memory — 12 users × 12 roles, 3 clients, 6 opportunities, 30 ngày PPC metrics… Quyền được mô phỏng đúng ma trận §3.3 ở adapter layer.
- **SUPABASE MODE** (có `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`): mọi truy cập chịu chi phối bởi RLS policies (migration `0002_rls.sql`).

## 3. Chạy dự án

```bash
npm install
npm run dev          # → http://localhost:3000 (DEMO MODE)
```

Đăng nhập bằng cách **chọn một user demo** (mỗi user một role khác nhau — thử `Nguyễn Bảo Châu` = research, `Đỗ Mai Phương` = finance, `Trịnh Văn Hùng` = reviewer để thấy phân quyền thay đổi).

```bash
npm test             # 71 tests
npm run typecheck    # tsc strict
npm run build        # production build
```

### Chuyển sang Supabase (production)

1. Tạo project Supabase (khuyên dùng region Singapore).
2. Chạy tuần tự 5 file trong `supabase/migrations/` (SQL Editor hoặc `supabase db push`):
   `0001_schema.sql` → `0002_rls.sql` → `0003_functions_triggers.sql` → `0004_storage.sql` → `0005_seed_reference.sql` *(file seed tự chứa & idempotent — tự tạo org nếu trống, không cần sửa UUID)*
3. Authentication → Users → **Add user** (email + password) — trigger tự tạo `profiles`.
4. SQL Editor: `select public.bootstrap_first_user();` — user đầu tiên thành **owner**, có client đầu tiên + full access.
5. Copy `.env.example` → `.env.local`, điền `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
6. `npm run dev` → trang /login sẽ hiển thị form email/password.

Xem chi tiết (kể thêm cách thêm thành viên, guardrail, troubleshooting): [`supabase/README.md`](supabase/README.md).

### Deploy lên Vercel

Repo đã kèm `vercel.json` ghim `framework: nextjs` (region `sin1` — Singapore, gần user VN và Supabase SG). Khi import project vào Vercel:

1. **Framework Preset** phải là **Next.js** (nếu thấy "Other" → đổi trong Settings → General, hoặc `vercel.json` sẽ tự áp dụng khi redeploy).
2. **Environment Variables** (Settings → Environment Variables) — thêm 2 biến sau nếu muốn chạy Supabase mode:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Không set 2 biến này → deployment chạy DEMO MODE (dữ liệu mẫu, nhãn amber hiện rõ trên header).
3. **Authentication → URL Configuration** ở Supabase: thêm domain `*.vercel.app` của bạn vào *Redirect URLs* nếu dùng magic link/OAuth (đăng nhập email/password không cần bước này).
4. Deploy. Không cần cấu hình Output Directory — preset Next.js tự dùng `.next`.

## 4. Cấu trúc thư mục

```
src/
├── app/
│   ├── login/                  # demo user switcher / supabase auth
│   └── (app)/                  # mọi route phía sau đăng nhập
│       ├── today/              # §5.1 Today dashboard + approval queue
│       ├── clients/            # client cards theo scope user_client_access
│       ├── research/           # §5.2 research inbox + workspace chi tiết
│       ├── launches/           # §4.2 kanban + checklist
│       ├── listings/           # §5.5 version history + AI audit + approval
│       ├── ads/                # §5.6 campaign table + recommendation queue
│       ├── inventory/          # §5.7 stockout projection + lead time + shipments
│       ├── messages/           # §5.8 CS inbox + classify + reply draft
│       ├── tasks/              # §5.9 board + comments
│       ├── reports/            # §13 KPI + audit log + AI runs
│       └── settings/           # members + ma trận quyền §3.3
├── components/                 # AppShell, UI primitives (server-renderable)
├── lib/
│   ├── actions.ts              # toàn bộ server actions (mutation duy nhất)
│   ├── permissions.ts          # ma trận quyền §3.3 (12 roles × 13 modules)
│   ├── types.ts                # domain types mirror schema SQL
│   ├── session.ts              # session helpers
│   ├── data/
│   │   ├── adapter.ts          # DataAdapter contract (spec §10)
│   │   ├── builders.ts         # Today cards / inventory rows dùng chung
│   │   ├── demo/               # DemoAdapter + seed + deterministic RNG
│   │   └── supabaseAdapter.ts  # production adapter
│   ├── domain/                 # metrics engines (pure, tested) + tests
│   └── ai/engine.ts            # AI heuristic engine + provider hook
supabase/migrations/            # schema + RLS + triggers + storage + settings
```

## 5. Phân quyền & bảo mật (spec §3, §7.2)

- **12 roles × 13 modules** mã hóa ở `src/lib/permissions.ts` (TS) **và** `has_module_permission()` (SQL) — hai nơi phải khớp nhau, có test cho cả hai phía.
- Quyền hiệu lực = giao của: role hệ thống × department × client được cấp (`user_client_access`) × loại dữ liệu × trạng thái approval.
- **Finance data** chỉ cho `finance/admin/owner/reviewer`; **customer message (PII)** chỉ cho `customer_service/account_manager/admin/owner/reviewer`.
- Mọi bảng nghiệp vụ bật RLS, **policy riêng cho từng bảng** (không dùng policy rộng toàn schema).
- Audit log append-only qua trigger `SECURITY DEFINER` — browser không thể ghi đè.
- Soft delete cho entity nghiệp vụ; hard delete chỉ admin/owner.
- Mutation nhạy cảm (Go/No-Go, cost profile, listing publish, PPC action, reorder, customer reply, data export) **bắt buộc qua `approval_requests`** trước khi execute.
- Storage: 5 private bucket, path `{org}/{client}/{entity}/file`, policy fail-closed với path không hợp lệ.

## 6. AI layer (spec §5.3, §12)

Structured output chuẩn: `summary / findings[type, claim, evidence_ids, confidence, impact] / missing_data / risks / next_actions`.

Quy tắc đang đảm bảo (có test):
- Không kết luận khi thiếu input tối thiểu → trả về **danh sách data gap**.
- Số liệu của provider luôn gắn nhãn **ESTIMATE**, không bao giờ là sales thực tế.
- Mọi finding trích dẫn **evidence IDs** (source/competitor/insight).
- Luôn trả về **confidence** + **missing evidence**.
- Số liệu tài chính do **metrics engine** tính (econ-v1), LLM không tự tính.
- Output luôn là **draft**; execute chỉ sau approval (human-in-the-loop).
- Mỗi run lưu `ai_runs`: prompt version, model, input record IDs, output JSON, reviewer, timestamp.

## 7. Mapping acceptance criteria MVP (spec §15)

| # | Tiêu chí | Trạng thái |
| --- | --- | --- |
| 1–2 | Admin tạo org/client/user, cấp client + department | ✅ schema + RLS + demo |
| 3 | User không đọc được dữ liệu ngoài client được cấp | ✅ RLS policies + adapter scope (đã E2E test) |
| 4 | Researcher tạo opportunity, upload source, submit decision | ✅ /research flow |
| 5 | AI summary có evidence + confidence | ✅ heuristic engine + /research/[id] |
| 6 | Finance tạo cost profile, tính scenario | ✅ economics engine (base/conservative/aggressive) |
| 7 | Reviewer duyệt Go/No-Go, lưu lịch sử | ✅ approval queue + audit (E2E verified) |
| 8 | Product `go` convert thành launch không nhập lại | ✅ convert-to-launch (E2E verified) |
| 9 | Listing version + approve/rollback | ✅ /listings |
| 10 | PPC import metrics + tạo recommendation | ✅ /ads + rules engine (5 rule types) |
| 11 | Inventory snapshot + lead time + stockout warning | ✅ /inventory |
| 12 | CS tạo reply draft + reviewer approve | ✅ /messages (policy-risk flags) |
| 13 | Mutation nhạy cảm có audit log | ✅ audit trigger SQL + demo audit |
| 14 | File private không truy cập được bằng URL công khai | ✅ private bucket + signed URL policy |
| 15 | AI không tự execute action nhạy cảm | ✅ guardrails + approval-first (unit tested) |
| 16 | Today chỉ hiển thị đúng scope | ✅ E2E verified (viewer/PPC/research) |
| 17 | Trạng thái lỗi khi data cũ/thiếu | ✅ incomplete economics, stale source badges |
| 18 | Test cho RLS, permission, economics, approval flow | ✅ 71 tests (permission matrix, formulas, guardrails) |

## 8. Lộ trình tiếp theo (sau MVP)

1. **Amazon SP-API** (spec §8.2): orders, reports, inventory, notifications — adapter riêng + feature flag + raw response storage.
2. **Amazon Ads API** (spec §8.3): async report request/status/download, metric versioning.
3. **AI provider thật**: cấu hình `AI_PROVIDER_*` đã sẵn — cần prompt registry + eval suite.
4. **Job queue**: bảng `job_runs` đã có schema; cần worker cho import/AI/sync/report.
5. **Realtime**: Supabase Realtime cho task/approval notifications.
6. **Search term level PPC**: negative keyword suggestions có approval riêng.

## 9. License

Internal use — dự án nội bộ theo đặc tả v1.0.
