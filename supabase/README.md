# Supabase migrations — Amazon Internal Operations Platform

Thứ tự chạy (Supabase Dashboard → SQL Editor, hoặc `supabase db push`):

| File | Nội dung |
| --- | --- |
| `0001_schema.sql` | 30+ bảng: identity/access, research, catalog, PPC, CS, workflow, AI, audit, job_runs, platform_settings |
| `0002_rls.sql` | Helper functions (`is_org_member`, `has_client_access`, `has_module_permission`…) + RLS policy cho từng bảng |
| `0003_functions_triggers.sql` | `updated_at`, tự tạo `profiles` khi có auth user, audit trigger cho bảng nhạy cảm, metrics derive trigger |
| `0004_storage.sql` | 5 private bucket + storage policy kiểm tra client access theo path prefix |
| `0005_seed_reference.sql` | **Tự chứa & idempotent**: tạo org mặc định nếu trống, guardrail defaults cho mọi org, cài `bootstrap_first_user()` |

## Bật dự án mới (5 phút)

1. Tạo project Supabase (region Singapore cho team VN).
2. Chạy tuần tự 5 file migration trên (SQL Editor → New query → dán → Run).
   - `0005` có thể chạy lại bao nhiêu lần cũng an toàn (dùng `ON CONFLICT DO NOTHING`).
3. **Authentication → Users → Add user** (email + password, tick "Auto Confirm User").
   → Trigger `on_auth_user_created` tự tạo dòng `profiles`.
4. **SQL Editor** chạy:
   ```sql
   select public.bootstrap_first_user();
   ```
   → User đầu tiên thành **owner** của organization, được tạo client đầu tiên
   và full access (`user_client_access`). Hàm trả về thông báo kết quả.
5. Copy `.env.example` → `.env.local`, điền `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
6. `npm run dev` → đăng nhập bằng email/password vừa tạo.

### Thêm thành viên / client sau này

```sql
-- Lấy organization_id + client_id hiện có
select id, name from client_accounts;

-- Thêm thành viên (đã tạo auth user ở bước 3)
insert into organization_members (organization_id, user_id, role, department, status)
values ('<org-id>', '<user-id>', 'product_research', 'research', 'active');

-- Cấp quyền truy cập client (full | department | read_only)
insert into user_client_access (user_id, client_account_id, access_level, allowed_departments)
values ('<user-id>', '<client-id>', 'department', '{research,sourcing}');
```

### Điều chỉnh guardrail (admin)

```sql
select key, value, description from platform_settings;
update platform_settings set value = '0.40' where key = 'acos_alert_threshold';
```

## Xử lý sự cố

| Triệu chứng | Nguyên nhân & cách xử lý |
| --- | --- |
| `insert or update on table "platform_settings" violates foreign key constraint` | Bản seed cũ tham chiếu UUID org hardcode. Bản `0005` hiện tại đã tự tạo org nếu trống — chạy lại file mới là hết. |
| Đăng nhập xong trang trắng / về login | User chưa có `organization_members` → chạy `select public.bootstrap_first_user();` hoặc INSERT thủ công (xem trên). |
| Query trong SQL Editor trả về nhiều hơn app | SQL Editor chạy với role chủ bảng (bypass RLS). App đi qua anon key + JWT nên chịu RLS đầy đủ — đây là hành vi chuẩn của Supabase. |
| `bootstrap_first_user` trả về "CHUA SAN SANG" | Chưa tạo user trong Authentication → Users. Tạo rồi chạy lại. |

## Nguyên tắc bảo mật (spec §3.4, §7.2)

- Mọi bảng nghiệp vụ bật RLS; **không có policy nào rộng cho toàn schema**.
- Quyền hiệu lực = giao của: role hệ thống × department × client được cấp × loại dữ liệu.
- Finance data chỉ đọc được bởi `finance`, `admin`, `owner`, `reviewer`.
- Customer message chỉ đọc được bởi `customer_service`, `account_manager`, `admin`, `owner`, `reviewer`.
- Audit log append-only qua trigger SECURITY DEFINER — client không thể ghi đè.
- Storage private bucket + signed URL; policy kiểm tra lại client access theo path prefix.
- `bootstrap_first_user()` đã REVOKE từ `public/anon/authenticated` — chỉ SQL editor (postgres) gọi được.
