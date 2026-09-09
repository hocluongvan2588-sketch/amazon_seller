# Supabase migrations — Amazon Internal Operations Platform

Thứ tự chạy (Supabase Dashboard → SQL Editor, hoặc `supabase db push`):

| File | Nội dung |
| --- | --- |
| `0001_schema.sql` | 30+ bảng: identity/access, research, catalog, PPC, CS, workflow, AI, audit, job_runs, platform_settings |
| `0002_rls.sql` | Helper functions (`is_org_member`, `has_client_access`, `has_module_permission`…) + RLS policy cho từng bảng |
| `0003_functions_triggers.sql` | `updated_at`, tự tạo `profiles` khi có auth user, audit trigger cho bảng nhạy cảm, metrics derive trigger |
| `0004_storage.sql` | 5 private bucket + storage policy kiểm tra client access theo path prefix |
| `0005_seed_reference.sql` | Guardrail/threshold mặc định cho admin cấu hình |

## Bật dự án mới

1. Tạo project Supabase (region Singapore cho team VN).
2. Chạy tuần tự 5 file migration trên.
3. Tạo user trong Authentication → Users; trigger `on_auth_user_created` tự tạo `profiles`.
4. Insert `organizations`, `organization_members`, `client_accounts`, `user_client_access` cho user đầu tiên (tham khảo seed demo trong `src/lib/data/demo/seed.ts`).
5. Cấu hình `.env.local` theo `.env.example`.

## Nguyên tắc bảo mật (spec §3.4, §7.2)

- Mọi bảng nghiệp vụ bật RLS; **không có policy nào rộng cho toàn schema**.
- Quyền hiệu lực = giao của: role hệ thống × department × client được cấp × loại dữ liệu.
- Finance data chỉ đọc được bởi `finance`, `admin`, `owner`, `reviewer`.
- Customer message chỉ đọc được bởi `customer_service`, `account_manager`, `admin`, `owner`, `reviewer`.
- Audit log append-only qua trigger SECURITY DEFINER — client không thể ghi đè.
- Storage private bucket + signed URL; policy kiểm tra lại client access theo path prefix.
