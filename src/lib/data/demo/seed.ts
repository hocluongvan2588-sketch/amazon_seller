/**
 * Demo dataset — mirrors the Supabase schema with realistic Vietnamese
 * Amazon-agency data. Deterministic (seeded RNG) so screenshots and tests
 * stay stable. In Supabase mode this file is not used.
 */

import type {
  AdCampaign,
  AdMetricsDaily,
  ApprovalRequest,
  Asin,
  AuditEvent,
  ClientAccount,
  CompetitorProduct,
  CostProfile,
  CustomerMessage,
  CustomerThread,
  InventorySnapshot,
  LaunchProject,
  LeadTimeConfig,
  ListingVersion,
  OrganizationMember,
  Product,
  ProductOpportunity,
  Profile,
  Recommendation,
  ResearchSource,
  ReviewInsight,
  RiskItem,
  Shipment,
  Sku,
  SupplierCandidate,
  Task,
  UserClientAccess,
} from "../../types";
import { generatePpcRecommendations, aggregateCampaignMetrics } from "../../domain/recommendations";
import { dateOffset, dateOnlyOffset, intBetween, seededRandom } from "./random";

const rng = seededRandom(20260909);

export const ORG_ID = "3f9c1e2a-0001-4000-8000-000000000001";

export const USERS: Profile[] = [
  { id: "u-owner", full_name: "Trần Minh Quân", email: "quan@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-admin", full_name: "Lê Thu Hà", email: "ha.admin@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-am", full_name: "Phạm Đức Anh", email: "ducanh@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-research", full_name: "Nguyễn Bảo Châu", email: "baochau@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-sourcing", full_name: "Vũ Đình Khoa", email: "khoa@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-content", full_name: "Đặng Khánh Linh", email: "khanhlinh@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-ppc", full_name: "Hoàng Nhật Nam", email: "nhatnam@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-inventory", full_name: "Bùi Thanh Tùng", email: "thanhtung@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-cs", full_name: "Ngô Hồng Nhung", email: "hongnhung@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-finance", full_name: "Đỗ Mai Phương", email: "maiphuong@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-reviewer", full_name: "Trịnh Văn Hùng", email: "vanhung@nhabanhang.vn", avatar_url: null, status: "active" },
  { id: "u-viewer", full_name: "Lý Ngọc Bích", email: "ngocbich@nhabanhang.vn", avatar_url: null, status: "active" },
];

export const MEMBERS: OrganizationMember[] = [
  { id: "m-1", organization_id: ORG_ID, user_id: "u-owner", role: "owner", department: "management", status: "active" },
  { id: "m-2", organization_id: ORG_ID, user_id: "u-admin", role: "admin", department: "management", status: "active" },
  { id: "m-3", organization_id: ORG_ID, user_id: "u-am", role: "account_manager", department: "management", status: "active" },
  { id: "m-4", organization_id: ORG_ID, user_id: "u-research", role: "product_research", department: "research", status: "active" },
  { id: "m-5", organization_id: ORG_ID, user_id: "u-sourcing", role: "sourcing", department: "sourcing", status: "active" },
  { id: "m-6", organization_id: ORG_ID, user_id: "u-content", role: "content_seo", department: "content", status: "active" },
  { id: "m-7", organization_id: ORG_ID, user_id: "u-ppc", role: "ppc_operator", department: "ppc", status: "active" },
  { id: "m-8", organization_id: ORG_ID, user_id: "u-inventory", role: "inventory_logistics", department: "inventory", status: "active" },
  { id: "m-9", organization_id: ORG_ID, user_id: "u-cs", role: "customer_service", department: "customer_service", status: "active" },
  { id: "m-10", organization_id: ORG_ID, user_id: "u-finance", role: "finance", department: "finance", status: "active" },
  { id: "m-11", organization_id: ORG_ID, user_id: "u-reviewer", role: "reviewer", department: "management", status: "active" },
  { id: "m-12", organization_id: ORG_ID, user_id: "u-viewer", role: "viewer", department: "management", status: "active" },
];

export const CLIENTS: ClientAccount[] = [
  {
    id: "client-tlc", organization_id: ORG_ID, name: "TLC Home Living",
    business_name: "Công ty TNHH TLC Home Living", primary_contact: { name: "Nguyễn Văn Lộc", email: "loc@tlchome.vn" },
    status: "active", owner_user_id: "u-am", marketplace: "US",
    created_at: dateOffset(-210), updated_at: dateOffset(-3),
  },
  {
    id: "client-eco", organization_id: ORG_ID, name: "EcoBelly Vietnam",
    business_name: "EcoBelly Co., Ltd", primary_contact: { name: "Trần Hải Yến", email: "yen@ecobelly.com" },
    status: "active", owner_user_id: "u-am", marketplace: "US",
    created_at: dateOffset(-150), updated_at: dateOffset(-5),
  },
  {
    id: "client-mom", organization_id: ORG_ID, name: "MomCare JSC",
    business_name: "Công ty CP MomCare", primary_contact: { name: "Lê Thu Thủy", email: "thuy@momcare.vn" },
    status: "onboarding", owner_user_id: "u-am", marketplace: "US",
    created_at: dateOffset(-40), updated_at: dateOffset(-10),
  },
];

export const USER_CLIENT_ACCESS: UserClientAccess[] = [
  { user_id: "u-owner", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-owner", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-owner", client_account_id: "client-mom", access_level: "full", allowed_departments: [] },
  { user_id: "u-admin", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-admin", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-admin", client_account_id: "client-mom", access_level: "full", allowed_departments: [] },
  { user_id: "u-am", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-am", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-am", client_account_id: "client-mom", access_level: "full", allowed_departments: [] },
  { user_id: "u-research", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-research", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-sourcing", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-sourcing", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-content", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-content", client_account_id: "client-eco", access_level: "department", allowed_departments: ["content"] },
  { user_id: "u-ppc", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-ppc", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-inventory", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-inventory", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-cs", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-cs", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-finance", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-finance", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  { user_id: "u-reviewer", client_account_id: "client-tlc", access_level: "full", allowed_departments: [] },
  { user_id: "u-reviewer", client_account_id: "client-eco", access_level: "full", allowed_departments: [] },
  // Viewer only has TLC — used to demo cross-tenant scoping in the UI
  { user_id: "u-viewer", client_account_id: "client-tlc", access_level: "read_only", allowed_departments: [] },
];

// ---------------------------------------------------------------------------
// Product opportunities
// ---------------------------------------------------------------------------

export const OPPORTUNITIES: ProductOpportunity[] = [
  {
    id: "opp-bottle", organization_id: ORG_ID, client_account_id: "client-tlc",
    name: "Bình giữ nhiệt 500ml vỏ thép", category: "Home & Kitchen", marketplace: "US",
    target_price: 26.99, stage: "pending_decision", decision: null, decision_reason: null,
    decided_by: null, decided_at: null, evidence_completeness: 88, opportunity_score: 68,
    score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-24), updated_at: dateOffset(-2), deleted_at: null,
  },
  {
    id: "opp-yoga", organization_id: ORG_ID, client_account_id: "client-eco",
    name: "Tapis yoga TPE 2 lớp 6mm", category: "Sports & Outdoors", marketplace: "US",
    target_price: 32.99, stage: "supplier_validation", decision: null, decision_reason: null,
    decided_by: null, decided_at: null, evidence_completeness: 54, opportunity_score: 55,
    score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-14), updated_at: dateOffset(-4), deleted_at: null,
  },
  {
    id: "opp-lunchbox", organization_id: ORG_ID, client_account_id: "client-eco",
    name: "Hộp cơm điện tần số cao", category: "Home & Kitchen", marketplace: "US",
    target_price: 24.5, stage: "researching", decision: null, decision_reason: null,
    decided_by: null, decided_at: null, evidence_completeness: 32, opportunity_score: 41,
    score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-8), updated_at: dateOffset(-1), deleted_at: null,
  },
  {
    id: "opp-pillow", organization_id: ORG_ID, client_account_id: "client-tlc",
    name: "Gối memory foam cổ cao cấp", category: "Bedding", marketplace: "US",
    target_price: 39.99, stage: "go", decision: "go",
    decision_reason: "Margin tốt (28%), nhu cầu ổn định, đã có supplier đạt sample.",
    decided_by: "u-reviewer", decided_at: dateOffset(-30), evidence_completeness: 92,
    opportunity_score: 78, score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-58), updated_at: dateOffset(-30), deleted_at: null,
  },
  {
    id: "opp-humidifier", organization_id: ORG_ID, client_account_id: "client-mom",
    name: "Máy tạo ẩm siêu âm cho bé", category: "Baby", marketplace: "US",
    target_price: 34.99, stage: "need_more_evidence", decision: "need_more_evidence",
    decision_reason: "Thiếu dữ liệu review insight và chi phí fulfillmentexact cho size 2L.",
    decided_by: "u-reviewer", decided_at: dateOffset(-6), evidence_completeness: 45,
    opportunity_score: 52, score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-35), updated_at: dateOffset(-6), deleted_at: null,
  },
  {
    id: "opp-fidget", organization_id: ORG_ID, client_account_id: "client-tlc",
    name: "Bộ đồ chơi fidget sensory", category: "Toys & Games", marketplace: "US",
    target_price: 16.99, stage: "no_go", decision: "no_go",
    decision_reason: "Cạnh tranh giá quá khốc liệt, margin contribution âm sau phí FBA.",
    decided_by: "u-reviewer", decided_at: dateOffset(-45), evidence_completeness: 70,
    opportunity_score: 22, score_version: "score-v1", owner_user_id: "u-research",
    created_at: dateOffset(-70), updated_at: dateOffset(-45), deleted_at: null,
  },
];

export const SOURCES: ResearchSource[] = [
  { id: "src-bottle-1", product_opportunity_id: "opp-bottle", source_type: "report_export", provider_name: "helium_10", source_url: null, captured_at: dateOffset(-22), uploaded_by: "u-research", file_path: null, file_name: "h10-blackbox-bottle.csv", content_hash: "a1b2c3d4", metadata: { rows: 24 }, created_at: dateOffset(-22) },
  { id: "src-bottle-2", product_opportunity_id: "opp-bottle", source_type: "url", provider_name: "keepa", source_url: "https://keepa.com/#!product/1-B0EXAMPLE", captured_at: dateOffset(-20), uploaded_by: "u-research", file_path: null, file_name: null, content_hash: null, metadata: { note: "Price history chart" }, created_at: dateOffset(-20) },
  { id: "src-bottle-3", product_opportunity_id: "opp-bottle", source_type: "file", provider_name: "amazon", source_url: null, captured_at: dateOffset(-18), uploaded_by: "u-research", file_path: "research/…/reviews-export.csv", file_name: "reviews-export.csv", content_hash: "e5f6a7b8", metadata: { review_count: 431 }, created_at: dateOffset(-18) },
  { id: "src-yoga-1", product_opportunity_id: "opp-yoga", source_type: "report_export", provider_name: "jungle_scout", source_url: null, captured_at: dateOffset(-12), uploaded_by: "u-research", file_path: null, file_name: "js-product-tracker-yoga.xlsx", content_hash: "11223344", metadata: { rows: 15 }, created_at: dateOffset(-12) },
  { id: "src-lunchbox-1", product_opportunity_id: "opp-lunchbox", source_type: "url", provider_name: "sellersprite", source_url: "https://sellersprite.com/en/product-research", captured_at: dateOffset(-7), uploaded_by: "u-research", file_path: null, file_name: null, content_hash: null, metadata: { note: "Screenshot" }, created_at: dateOffset(-7) },
  { id: "src-pillow-1", product_opportunity_id: "opp-pillow", source_type: "report_export", provider_name: "helium_10", source_url: null, captured_at: dateOffset(-56), uploaded_by: "u-research", file_path: null, file_name: "h10-pillow.csv", content_hash: "99aabbcc", metadata: { rows: 31 }, created_at: dateOffset(-56) },
  { id: "src-pillow-2", product_opportunity_id: "opp-pillow", source_type: "file", provider_name: "amazon", source_url: null, captured_at: dateOffset(-50), uploaded_by: "u-research", file_path: null, file_name: "reviews-pillow.csv", content_hash: "ddee0011", metadata: { review_count: 620 }, created_at: dateOffset(-50) },
  { id: "src-humidifier-1", product_opportunity_id: "opp-humidifier", source_type: "report_export", provider_name: "data_dive", source_url: null, captured_at: dateOffset(-33), uploaded_by: "u-research", file_path: null, file_name: "datadive-humidifier.csv", content_hash: "22334455", metadata: { rows: 18 }, created_at: dateOffset(-33) },
  { id: "src-fidget-1", product_opportunity_id: "opp-fidget", source_type: "report_export", provider_name: "helium_10", source_url: null, captured_at: dateOffset(-68), uploaded_by: "u-research", file_path: null, file_name: "h10-fidget.csv", content_hash: "66778899", metadata: { rows: 22 }, created_at: dateOffset(-68) },
];

function competitor(oppId: string, sourceId: string, i: number, data: Partial<CompetitorProduct>): CompetitorProduct {
  return {
    id: `comp-${oppId.slice(4)}-${i}`, product_opportunity_id: oppId,
    data_source_id: sourceId, observed_at: dateOffset(-20 + i),
    asin: `B0DEM0${String(i).padStart(3, "0")}`, title: "Competitor product", brand: null,
    price: null, rating: null, review_count: null, bsr: null, monthly_sales: null, monthly_revenue: null,
    ...data,
  };
}

export const COMPETITORS: CompetitorProduct[] = [
  competitor("opp-bottle", "src-bottle-1", 1, { asin: "B07QXTXY1K", title: "Insulated Water Bottle 500ml Stainless", brand: "ThermoCore", price: 27.99, rating: 4.5, review_count: 8432, bsr: 1200, monthly_sales: 4200, monthly_revenue: 117558 }),
  competitor("opp-bottle", "src-bottle-1", 2, { asin: "B08KRTG2XM", title: "Double Wall Vacuum Flask 17oz", brand: "PeakWare", price: 24.95, rating: 4.3, review_count: 2310, bsr: 2800, monthly_sales: 1900, monthly_revenue: 47405 }),
  competitor("opp-bottle", "src-bottle-1", 3, { asin: "B09XYZ8LQM", title: "Steel Bottle with Straw Lid", brand: "HydraHome", price: 29.99, rating: 4.6, review_count: 15600, bsr: 850, monthly_sales: 5600, monthly_revenue: 167944 }),
  competitor("opp-bottle", "src-bottle-1", 4, { asin: "B0BJ7QK4NP", title: "Kids Thermal Bottle 12oz", brand: "MiniSip", price: 19.99, rating: 4.1, review_count: 640, bsr: 6200, monthly_sales: 780, monthly_revenue: 15592 }),
  competitor("opp-bottle", "src-bottle-1", 5, { asin: "B0C3LMN9RT", title: "Gym Bottle 500ml Matte Finish", brand: "FitFuel", price: 22.49, rating: 3.9, review_count: 410, bsr: 9100, monthly_sales: 350, monthly_revenue: 7872 }),
  competitor("opp-yoga", "src-yoga-1", 1, { asin: "B06XTJMFV9", title: "TPE Yoga Mat 6mm Non Slip", brand: "ZenFlow", price: 31.99, rating: 4.4, review_count: 3120, bsr: 1900, monthly_sales: 1600, monthly_revenue: 51184 }),
  competitor("opp-yoga", "src-yoga-1", 2, { asin: "B07T5KZP8N", title: "Eco Yoga Mat Dual Layer", brand: "GreenGrip", price: 35.99, rating: 4.7, review_count: 980, bsr: 3400, monthly_sales: 900, monthly_revenue: 32391 }),
  competitor("opp-yoga", "src-yoga-1", 3, { asin: "B08QRSTU4V", title: "Yoga Mat Extra Thick 8mm", brand: "LotusPro", price: 28.5, rating: 4.0, review_count: 1450, bsr: 4100, monthly_sales: 700, monthly_revenue: 19950 }),
  competitor("opp-pillow", "src-pillow-1", 1, { asin: "B01N5IB20Q", title: "Cervical Memory Foam Pillow", brand: "NeckRest", price: 39.99, rating: 4.3, review_count: 12400, bsr: 700, monthly_sales: 3800, monthly_revenue: 151962 }),
  competitor("opp-pillow", "src-pillow-1", 2, { asin: "B07HKDDV2C", title: "Orthopedic Contour Pillow", brand: "SleepWell", price: 44.99, rating: 4.5, review_count: 5600, bsr: 1300, monthly_sales: 2100, monthly_revenue: 94479 }),
  competitor("opp-pillow", "src-pillow-1", 3, { asin: "B09PLMK3IO", title: "Cervical Pillows for Neck Pain", brand: "DreamNest", price: 36.99, rating: 4.2, review_count: 2100, bsr: 2600, monthly_sales: 1400, monthly_revenue: 51786 }),
  competitor("opp-humidifier", "src-humidifier-1", 1, { asin: "B00VXGQ2RE", title: "Cool Mist Humidifier 2L", brand: "AirCare", price: 32.99, rating: 4.4, review_count: 28300, bsr: 420, monthly_sales: 6900, monthly_revenue: 227631 }),
  competitor("opp-humidifier", "src-humidifier-1", 2, { asin: "B07B4RL9TJ", title: "Nursery Humidifier with Night Light", brand: "BabyAir", price: 38.5, rating: 4.6, review_count: 8900, bsr: 980, monthly_sales: 2600, monthly_revenue: 100100 }),
  competitor("opp-fidget", "src-fidget-1", 1, { asin: "B081T3N2RV", title: "Fidget Toy Set 25 Pack", brand: "SensoryPlay", price: 14.99, rating: 4.2, review_count: 31000, bsr: 300, monthly_sales: 8800, monthly_revenue: 131912 }),
];

export const REVIEW_INSIGHTS: ReviewInsight[] = [
  { id: "ri-1", product_opportunity_id: "opp-bottle", source_id: "src-bottle-3", theme: "Rò nước ở nắp", sentiment: "negative", frequency: 87, evidence_count: 23, examples: ["Leaked in my bag after 2 weeks", "Lid seal fails when tipped over"], ai_confidence: "high", created_at: dateOffset(-17) },
  { id: "ri-2", product_opportunity_id: "opp-bottle", source_id: "src-bottle-3", theme: "Giữ nhiệt tốt", sentiment: "positive", frequency: 210, evidence_count: 64, examples: ["Ice still there after 24h", "Keeps coffee hot all morning"], ai_confidence: "high", created_at: dateOffset(-17) },
  { id: "ri-3", product_opportunity_id: "opp-bottle", source_id: "src-bottle-3", theme: "Sơn bong trầy", sentiment: "negative", frequency: 54, evidence_count: 18, examples: ["Paint chipped after 1 month", "Coating peels off"], ai_confidence: "medium", created_at: dateOffset(-17) },
  { id: "ri-4", product_opportunity_id: "opp-bottle", source_id: "src-bottle-3", theme: "Muốn có size lớn hơn", sentiment: "neutral", frequency: 33, evidence_count: 11, examples: ["Wish it came in 32oz"], ai_confidence: "medium", created_at: dateOffset(-17) },
  { id: "ri-5", product_opportunity_id: "opp-pillow", source_id: "src-pillow-2", theme: "Hơi cứng lúc mới dùng", sentiment: "negative", frequency: 66, evidence_count: 20, examples: ["Took 2 weeks to break in"], ai_confidence: "medium", created_at: dateOffset(-49) },
  { id: "ri-6", product_opportunity_id: "opp-pillow", source_id: "src-pillow-2", theme: "Giảm đau cổ rõ rệt", sentiment: "positive", frequency: 188, evidence_count: 71, examples: ["Neck pain gone in a week"], ai_confidence: "high", created_at: dateOffset(-49) },
];

export const SUPPLIERS: SupplierCandidate[] = [
  { id: "sup-1", product_opportunity_id: "opp-bottle", supplier_name: "Yongkang Deli Industry", country: "CN", contact_reference: "WeChat: deli_export03", moq: 1000, quoted_cogs: 6.2, lead_time_days: 35, sample_status: "received", quality_status: "pending", notes: "Sample nắp hơi lỏng — đang yêu cầu phiên bản seal mới", created_at: dateOffset(-15) },
  { id: "sup-2", product_opportunity_id: "opp-bottle", supplier_name: "Viet Steelware Binh Duong", country: "VN", contact_reference: "sales@vietsteelware.vn", moq: 1500, quoted_cogs: 7.1, lead_time_days: 25, sample_status: "in_transit", quality_status: "pending", notes: "COGS cao hơn TQ 0.9 nhưng lead time ngắn hơn 10 ngày", created_at: dateOffset(-10) },
  { id: "sup-3", product_opportunity_id: "opp-yoga", supplier_name: "Dongguan YogaFlex Factory", country: "CN", contact_reference: "Alibaba: yogaflex_en", moq: 500, quoted_cogs: 8.4, lead_time_days: 30, sample_status: "requested", quality_status: "unknown", notes: null, created_at: dateOffset(-6) },
  { id: "sup-4", product_opportunity_id: "opp-pillow", supplier_name: "Ningbo SoftRest Textiles", country: "CN", contact_reference: "Alibaba: softrest88", moq: 800, quoted_cogs: 9.8, lead_time_days: 40, sample_status: "approved", quality_status: "passed", notes: "Sample đạt, memory foam density 50D", created_at: dateOffset(-40) },
];

export const RISKS: RiskItem[] = [
  { id: "risk-1", product_opportunity_id: "opp-bottle", category: "quality", description: "Nắp bottle rò nước theo feedback review đối thủ (23/431 reviews)", severity: "high", status: "open", mitigation: "Yêu cầu supplier cải tiến seal + test 100% trước khi xuất", created_at: dateOffset(-16) },
  { id: "risk-2", product_opportunity_id: "opp-bottle", category: "brand", description: "1 đối thủ có 15.6k reviews — khó giành Buy Box ngay lúc launch", severity: "medium", status: "open", mitigation: "Định vị phân khúc differentiator (size lớn / phụ kiện)", created_at: dateOffset(-16) },
  { id: "risk-3", product_opportunity_id: "opp-bottle", category: "compliance", description: "Cần kiểm tra chứng nhận FDA food-grade cho lớp tráng trong", severity: "high", status: "open", mitigation: "Xin chứng nhận từ supplier trước khi đặt PO", created_at: dateOffset(-14) },
  { id: "risk-4", product_opportunity_id: "opp-yoga", category: "seasonality", description: "Nhu cầu yoga mat tăng mạnh vào Q1 (New Year resolution)", severity: "low", status: "accepted", mitigation: null, created_at: dateOffset(-11) },
  { id: "risk-5", product_opportunity_id: "opp-humidifier", category: "compliance", description: "Máy tạo ẩm cho bé có thể cần kiểm tra an toàn điện (UL/ETL)", severity: "high", status: "open", mitigation: "Chờ báo cáo kiểm tra từ supplier", created_at: dateOffset(-30) },
  { id: "risk-6", product_opportunity_id: "opp-fidget", category: "economics", description: "Margin contribution âm sau FBA fee với giá bán hiện tại của top đối thủ", severity: "critical", status: "accepted", mitigation: "Không theo đuổi sản phẩm này", created_at: dateOffset(-46) },
];

// ---------------------------------------------------------------------------
// Catalog: products / asins / skus
// ---------------------------------------------------------------------------

export const PRODUCTS: Product[] = [
  { id: "prod-pillow", client_account_id: "client-tlc", product_opportunity_id: "opp-pillow", name: "Gối memory foam cổ cao cấp", brand: "NeckCloud", category: "Bedding", status: "active", launch_project_id: "launch-pillow", created_at: dateOffset(-29) },
  { id: "prod-bottle", client_account_id: "client-tlc", product_opportunity_id: "opp-bottle", name: "Bình giữ nhiệt 500ml", brand: "ThermoVN", category: "Home & Kitchen", status: "draft", launch_project_id: null, created_at: dateOffset(-20) },
  { id: "prod-difuser", client_account_id: "client-eco", product_opportunity_id: null, name: "Đèn tinh dầu diffuser 300ml", brand: "EcoBelly", category: "Home & Kitchen", status: "active", launch_project_id: "launch-diffuser", created_at: dateOffset(-120) },
];

export const ASINS: Asin[] = [
  { id: "asin-pillow", product_id: "prod-pillow", asin: "B0PILLOW01", marketplace: "US", title: "NeckCloud Cervical Memory Foam Pillow for Neck Pain Relief", status: "live", source_snapshot_id: null },
  { id: "asin-bottle", product_id: "prod-bottle", asin: "B0BOTTLE01", marketplace: "US", title: "ThermoVN Insulated Water Bottle 500ml", status: "planned", source_snapshot_id: null },
  { id: "asin-diffuser", product_id: "prod-difuser", asin: "B0DIFFUSE1", marketplace: "US", title: "EcoBelly Aromatherapy Diffuser 300ml Wood Grain", status: "live", source_snapshot_id: null },
];

export const SKUS: Sku[] = [
  { id: "sku-pillow-st", asin_id: "asin-pillow", sku: "NC-PILLOW-ST-BLK", fnsku: "X0PILLOWST1", supplier_id: "sup-4", status: "active", package_weight: 0.85, package_length: 58, package_width: 38, package_height: 12 },
  { id: "sku-pillow-pr", asin_id: "asin-pillow", sku: "NC-PILLOW-PR-WHT", fnsku: "X0PILLOWPR1", supplier_id: "sup-4", status: "active", package_weight: 0.85, package_length: 58, package_width: 38, package_height: 12 },
  { id: "sku-bottle-st", asin_id: "asin-bottle", sku: "TV-BTL-500-ST", fnsku: null, supplier_id: null, status: "planned", package_weight: 0.42, package_length: 26, package_width: 8, package_height: 8 },
  { id: "sku-diffuser-wd", asin_id: "asin-diffuser", sku: "EB-DIFF-300-WD", fnsku: "X0DIFFWD01", supplier_id: null, status: "active", package_weight: 0.95, package_length: 20, package_width: 14, package_height: 14 },
];

// ---------------------------------------------------------------------------
// Launch projects & listings
// ---------------------------------------------------------------------------

export const LAUNCHES: LaunchProject[] = [
  {
    id: "launch-pillow", client_account_id: "client-tlc", product_id: "prod-pillow",
    stage: "stabilizing", target_launch_date: dateOnlyOffset(-12), actual_launch_date: dateOnlyOffset(-11),
    owner_user_id: "u-am", health_status: "on_track",
    checklist: [
      { key: "listing_approved", label: "Listing đã duyệt & publish", done: true, department: "content" },
      { key: "inventory_first_po", label: "PO đầu tiên đã check-in FBA", done: true, department: "inventory" },
      { key: "ppc_launch_campaigns", label: "Campaign launch SP đã chạy", done: true, department: "ppc" },
      { key: "review_strategy", label: "Chiến lược thu review đầu tiên", done: true, department: "management" },
      { key: "first_week_report", label: "Báo cáo tuần đầu gửi client", done: false, department: "management" },
    ],
    created_at: dateOffset(-28), updated_at: dateOffset(-2), deleted_at: null,
  },
  {
    id: "launch-diffuser", client_account_id: "client-eco", product_id: "prod-difuser",
    stage: "scaling", target_launch_date: dateOnlyOffset(-80), actual_launch_date: dateOnlyOffset(-82),
    owner_user_id: "u-am", health_status: "at_risk",
    checklist: [
      { key: "listing_approved", label: "Listing đã duyệt & publish", done: true, department: "content" },
      { key: "restock_plan", label: "Kế hoạch restock Q4 đã chốt", done: false, department: "inventory" },
      { key: "ppc_scale_budget", label: "Duyệt tăng budget scale-up", done: false, department: "ppc" },
    ],
    created_at: dateOffset(-110), updated_at: dateOffset(-4), deleted_at: null,
  },
];

export const LISTING_VERSIONS: ListingVersion[] = [
  {
    id: "lv-pillow-1", asin_id: "asin-pillow", version_number: 1,
    title: "Memory Foam Pillow Neck Cloud",
    bullets: ["Ergonomic cervical design", "Memory foam 50D", "Breathable cover"],
    description: "Pillow for neck pain relief with premium memory foam.",
    backend_terms: ["cervical pillow", "neck pillow memory foam"],
    attributes: { material: "Memory Foam" }, images: [], status: "published",
    change_reason: "Initial listing", created_by: "u-content", approved_by: "u-reviewer",
    approved_at: dateOffset(-15), created_at: dateOffset(-16),
  },
  {
    id: "lv-pillow-2", asin_id: "asin-pillow", version_number: 2,
    title: "NeckCloud Cervical Memory Foam Pillow — Neck Pain Relief, Ergonomic Contour for Side & Back Sleepers",
    bullets: [
      "RELIEVE NECK PAIN — ergonomic cervical contour supports the natural curve of your neck",
      "PREMIUM 50D MEMORY FOAM — firm yet adaptive; regains shape night after night",
      "COOLING BREATHABLE COVER — machine-washable bamboo-blend pillowcase included",
    ],
    description: "Wake up without neck pain. Designed with physiotherapists for side and back sleepers.",
    backend_terms: ["cervical pillow for neck pain", "orthopedic pillow side sleeper", "memory foam neck pillow", "contour pillow"],
    attributes: { material: "Memory Foam", firmness: "Medium-Firm", care: "Cover machine washable" },
    images: [], status: "internal_review",
    change_reason: "Optimize keywords + benefit-led bullets sau 2 tuần launch",
    created_by: "u-content", approved_by: null, approved_at: null, created_at: dateOffset(-3),
  },
  {
    id: "lv-diffuser-1", asin_id: "asin-diffuser", version_number: 1,
    title: "EcoBelly Aromatherapy Diffuser 300ml Wood Grain Ultrasonic",
    bullets: ["300ml large tank", "Whisper quiet", "7 color LED", "Auto shut-off"],
    description: "Ultrasonic essential oil diffuser with wood grain finish.",
    backend_terms: ["essential oil diffuser", "aroma diffuser 300ml"],
    attributes: {}, images: [], status: "published",
    change_reason: "Initial listing", created_by: "u-content", approved_by: "u-reviewer",
    approved_at: dateOffset(-85), created_at: dateOffset(-86),
  },
  {
    id: "lv-bottle-1", asin_id: "asin-bottle", version_number: 1,
    title: "ThermoVN Insulated Water Bottle 500ml — 24h Cold / 12h Hot, Leakproof Straw Lid",
    bullets: ["24 HOURS COLD — double wall vacuum insulation", "LEAKPROOF straw lid — tested upside down", "18/8 food-grade stainless steel", "Fits car cup holders"],
    description: "Draft listing cho launch bình giữ nhiệt.",
    backend_terms: ["insulated water bottle 500ml", "steel water bottle leakproof"],
    attributes: {}, images: [], status: "draft",
    change_reason: "Draft đầu tiên từ research findings", created_by: "u-content",
    approved_by: null, approved_at: null, created_at: dateOffset(-5),
  },
];

// ---------------------------------------------------------------------------
// Cost profiles (finance)
// ---------------------------------------------------------------------------

export const COST_PROFILES: CostProfile[] = [
  {
    id: "cp-pillow-1", sku_id: "sku-pillow-st", marketplace: "US", currency: "USD",
    selling_price: 39.99, cogs: 9.8, freight: 2.9, duty: 0.0, fba_fee: 8.54, referral_fee: 6.0,
    storage_cost: 0.45, ad_allowance: 6.0, return_allowance: 1.2, promotion_allowance: 0,
    other_variable_cost: 0.2, packaging: 0.6, inspection: 0.25, third_party_logistics: 0,
    fx_rate: 1, scenario: "base", effective_from: dateOnlyOffset(-60), effective_to: null,
    status: "approved", approved_by: "u-reviewer", formula_version: "econ-v1",
    created_by: "u-finance", created_at: dateOffset(-55),
  },
  {
    id: "cp-bottle-1", sku_id: "sku-bottle-st", marketplace: "US", currency: "USD",
    selling_price: 26.99, cogs: 6.2, freight: 1.7, duty: 0, fba_fee: 6.15, referral_fee: 4.05,
    storage_cost: 0.3, ad_allowance: 4.0, return_allowance: 0.8, promotion_allowance: 0,
    other_variable_cost: 0.15, packaging: 0.4, inspection: 0.15, third_party_logistics: 0,
    fx_rate: 1, scenario: "base", effective_from: dateOnlyOffset(-20), effective_to: null,
    status: "pending_approval", approved_by: null, formula_version: "econ-v1",
    created_by: "u-finance", created_at: dateOffset(-3),
  },
  {
    id: "cp-diffuser-1", sku_id: "sku-diffuser-wd", marketplace: "US", currency: "USD",
    selling_price: 29.99, cogs: 7.5, freight: 2.4, duty: 0, fba_fee: 6.8, referral_fee: 4.5,
    storage_cost: 0.35, ad_allowance: 5.5, return_allowance: 0.9, promotion_allowance: 0.5,
    other_variable_cost: 0.2, packaging: 0.5, inspection: 0.2, third_party_logistics: 0,
    fx_rate: 1, scenario: "base", effective_from: dateOnlyOffset(-100), effective_to: null,
    status: "locked", approved_by: "u-reviewer", formula_version: "econ-v1",
    created_by: "u-finance", created_at: dateOffset(-95),
  },
];

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const INVENTORY_SNAPSHOTS: InventorySnapshot[] = [
  { id: "inv-1", sku_id: "sku-pillow-st", snapshot_date: dateOnlyOffset(-1), sellable_units: 420, reserved_units: 35, inbound_units: 600, unfulfillable_units: 4, units_sold: 300, observation_days: 30, average_daily_sales: 10, days_of_supply: 42, source_snapshot_id: null, created_at: dateOffset(-1) },
  { id: "inv-2", sku_id: "sku-pillow-pr", snapshot_date: dateOnlyOffset(-1), sellable_units: 180, reserved_units: 12, inbound_units: 300, unfulfillable_units: 2, units_sold: 180, observation_days: 30, average_daily_sales: 6, days_of_supply: 30, source_snapshot_id: null, created_at: dateOffset(-1) },
  { id: "inv-3", sku_id: "sku-diffuser-wd", snapshot_date: dateOnlyOffset(-1), sellable_units: 85, reserved_units: 20, inbound_units: 0, unfulfillable_units: 0, units_sold: 450, observation_days: 30, average_daily_sales: 15, days_of_supply: 5.67, source_snapshot_id: null, created_at: dateOffset(-1) },
];

export const LEAD_TIMES: LeadTimeConfig[] = [
  { id: "lt-1", sku_id: "sku-pillow-st", production_lead_time_days: 30, freight_lead_time_days: 32, customs_buffer_days: 5, safety_stock_units: 100, reorder_quantity: 900, route: "VN → US (sea)", created_at: dateOffset(-50) },
  { id: "lt-2", sku_id: "sku-pillow-pr", production_lead_time_days: 30, freight_lead_time_days: 32, customs_buffer_days: 5, safety_stock_units: 60, reorder_quantity: 500, route: "VN → US (sea)", created_at: dateOffset(-50) },
  { id: "lt-3", sku_id: "sku-diffuser-wd", production_lead_time_days: 35, freight_lead_time_days: 35, customs_buffer_days: 5, safety_stock_units: 150, reorder_quantity: 1200, route: "CN → US (sea)", created_at: dateOffset(-90) },
];

export const SHIPMENTS: Shipment[] = [
  { id: "ship-1", client_account_id: "client-tlc", shipment_reference: "FBA15A1B2C3D", origin: "Hải Phòng, VN", destination: "ONT8, US", sku_lines: [{ sku_id: "sku-pillow-st", quantity: 600 }], quantity: 600, ship_date: dateOnlyOffset(-20), eta: dateOnlyOffset(8), status: "in_transit", freight_cost: 1750, tracking_reference: "COSU6211234567", created_at: dateOffset(-21) },
  { id: "ship-2", client_account_id: "client-eco", shipment_reference: "FBA15X9Y8Z7W", origin: "Ningbo, CN", destination: "LAX9, US", sku_lines: [{ sku_id: "sku-diffuser-wd", quantity: 0 }], quantity: 0, ship_date: null, eta: null, status: "planned", freight_cost: null, tracking_reference: null, created_at: dateOffset(-2) },
];

// ---------------------------------------------------------------------------
// PPC
// ---------------------------------------------------------------------------

export const CAMPAIGNS: AdCampaign[] = [
  { id: "camp-pl-sp", client_account_id: "client-tlc", amazon_account_id: "amz-tlc-01", marketplace: "US", campaign_id: "3111111111", name: "SP Pillow Exact — Core", campaign_type: "sponsored_products", daily_budget: 45, status: "enabled", last_synced_at: dateOffset(-1), created_at: dateOffset(-80) },
  { id: "camp-pl-auto", client_account_id: "client-tlc", amazon_account_id: "amz-tlc-01", marketplace: "US", campaign_id: "3222222222", name: "SP Pillow Auto — Discovery", campaign_type: "sponsored_products", daily_budget: 25, status: "enabled", last_synced_at: dateOffset(-1), created_at: dateOffset(-80) },
  { id: "camp-df-sp", client_account_id: "client-eco", amazon_account_id: "amz-eco-01", marketplace: "US", campaign_id: "3333333333", name: "SP Diffuser Exact — High Bid", campaign_type: "sponsored_products", daily_budget: 40, status: "enabled", last_synced_at: dateOffset(-2), created_at: dateOffset(-100) },
  { id: "camp-df-sb", client_account_id: "client-eco", amazon_account_id: "amz-eco-01", marketplace: "US", campaign_id: "3444444444", name: "SB Diffuser Brand — Keyword", campaign_type: "sponsored_brands", daily_budget: 30, status: "paused", last_synced_at: dateOffset(-2), created_at: dateOffset(-60) },
];

/** 30 days of metrics per campaign with distinct stories for the rules. */
export const AD_METRICS: AdMetricsDaily[] = (() => {
  const rows: AdMetricsDaily[] = [];
  const gen = (campaignId: string, story: "healthy" | "budget" | "spend_no_orders" | "acos_blow" | "cvr_drop") => {
    for (let i = 29; i >= 0; i--) {
      const date = dateOnlyOffset(-i);
      let impressions: number, clicks: number, spend: number, orders: number, sales: number;
      switch (story) {
        case "healthy":
          impressions = intBetween(rng, 3200, 4200); clicks = intBetween(rng, 90, 130);
          spend = +(clicks * (0.45 + rng() * 0.1)).toFixed(2); orders = intBetween(rng, 9, 14);
          sales = +(orders * 39.99).toFixed(2);
          break;
        case "budget":
          impressions = intBetween(rng, 5200, 6400); clicks = intBetween(rng, 140, 180);
          spend = +(clicks * 0.3).toFixed(2); orders = intBetween(rng, 6, 10);
          sales = +(orders * 39.99).toFixed(2);
          break;
        case "spend_no_orders":
          impressions = intBetween(rng, 1800, 2600); clicks = intBetween(rng, 30, 55);
          spend = +(clicks * 0.4).toFixed(2); orders = 0; sales = 0;
          break;
        case "acos_blow":
          impressions = intBetween(rng, 3000, 3800); clicks = intBetween(rng, 80, 120);
          spend = +(clicks * 0.55).toFixed(2); orders = intBetween(rng, 3, 6);
          sales = +(orders * 29.99).toFixed(2);
          break;
        case "cvr_drop":
          {
            const recent = i < 7;
            impressions = intBetween(rng, 3000, 4000); clicks = intBetween(rng, 85, 120);
            spend = +(clicks * 0.42).toFixed(2);
            orders = recent ? intBetween(rng, 1, 2) : intBetween(rng, 8, 12);
            sales = +(orders * 29.99).toFixed(2);
          }
          break;
      }
      rows.push({
        id: `${campaignId}-${date}`, campaign_id: campaignId, metric_date: date,
        impressions, clicks, spend, orders, sales,
        ctr: impressions > 0 ? +(clicks / impressions).toFixed(4) : null,
        cvr: clicks > 0 ? +(orders / clicks).toFixed(4) : null,
        acos: sales > 0 ? +(spend / sales).toFixed(4) : null,
        tacos: null, source_report_id: "sp-report-2026-09",
      });
    }
  };
  gen("camp-pl-sp", "healthy");
  gen("camp-pl-auto", "budget");
  gen("camp-df-sp", "cvr_drop");
  gen("camp-df-sb", "spend_no_orders");
  return rows;
})();

// ---------------------------------------------------------------------------
// Customer service
// ---------------------------------------------------------------------------

export const THREADS: CustomerThread[] = [
  { id: "thread-1", client_account_id: "client-tlc", marketplace: "US", external_thread_id: "amz-msg-99181", customer_reference: "KH-88213 (anon)", subject: "Pillow smell when unboxing", status: "open", priority: "high", assigned_to: "u-cs", last_message_at: dateOffset(-1), created_at: dateOffset(-1) },
  { id: "thread-2", client_account_id: "client-tlc", marketplace: "US", external_thread_id: "amz-msg-99177", customer_reference: "KH-88104 (anon)", subject: "Where is my order?", status: "pending_response", priority: "urgent", assigned_to: "u-cs", last_message_at: dateOffset(-2), created_at: dateOffset(-2) },
  { id: "thread-3", client_account_id: "client-eco", marketplace: "US", external_thread_id: "amz-msg-99150", customer_reference: "KH-77331 (anon)", subject: "Diffuser stopped misting", status: "open", priority: "medium", assigned_to: null, last_message_at: dateOffset(-3), created_at: dateOffset(-3) },
  { id: "thread-4", client_account_id: "client-eco", marketplace: "US", external_thread_id: "amz-msg-99140", customer_reference: "KH-77210 (anon)", subject: "Can you give refund outside Amazon?", status: "awaiting_customer", priority: "high", assigned_to: "u-cs", last_message_at: dateOffset(-5), created_at: dateOffset(-6) },
];

export const MESSAGES: CustomerMessage[] = [
  { id: "msg-1", thread_id: "thread-1", direction: "inbound", message_text: "Hi, I just received the pillow but there is a strong chemical smell out of the box. Is it safe? What should I do?", intent: "defect_complaint", urgency: "high", ai_summary: "KH phàn nàn mùi hóa chất khi mở hộp gối — cần hướng dẫn xử lý và kiểm tra quy trình off-gassing.", reply_draft: null, policy_risk_level: null, policy_risk_notes: null, status: "new", source_snapshot_id: null, created_at: dateOffset(-1) },
  { id: "msg-2", thread_id: "thread-2", direction: "inbound", message_text: "Order #114-8827361-9921 marked delivered 3 days ago but I never received it. I want a refund NOW or I will leave 1 star.", intent: "shipping_issue", urgency: "urgent", ai_summary: "KH chưa nhận được đơn đã đánh dấu delivered — đòi refund, dọa để review 1 sao. Rủi ro cao về policy khi xử lý.", reply_draft: null, policy_risk_level: "high", policy_risk_notes: ["Không hứa refund ngoài policy Amazon", "Không yêu cầu KH thay đổi/xóa review"], status: "new", source_snapshot_id: null, created_at: dateOffset(-2) },
  { id: "msg-3", thread_id: "thread-3", direction: "inbound", message_text: "My diffuser stopped producing mist after two weeks. I cleaned it with vinegar like the manual said. Still nothing.", intent: "defect_complaint", urgency: "medium", ai_summary: "Máy diffuser hết phát sương sau 2 tuần dù đã vệ sinh theo hướng dẫn — có thể lỗi bộ rung.", reply_draft: null, policy_risk_level: null, policy_risk_notes: null, status: "new", source_snapshot_id: null, created_at: dateOffset(-3) },
  { id: "msg-4", thread_id: "thread-4", direction: "inbound", message_text: "Can you just PayPal me a refund so it's faster? I don't want to go through Amazon returns.", intent: "return_refund", urgency: "high", ai_summary: "KH yêu cầu refund qua PayPal ngoài hệ thống Amazon — vi phạm policy, phải từ chối khéo.", reply_draft: "We truly appreciate your patience! Unfortunately, for your protection and ours, all refunds must be processed through Amazon's system. If you open a return request, we'll approve it right away.", policy_risk_level: "high", policy_risk_notes: ["Không chuyển tiền ngoài Amazon"], status: "pending_approval", source_snapshot_id: null, created_at: dateOffset(-5) },
  { id: "msg-5", thread_id: "thread-4", direction: "outbound", message_text: "Thank you for reaching out. All refunds are handled via Amazon to keep your buyer protection active.", intent: null, urgency: null, ai_summary: null, reply_draft: null, policy_risk_level: null, policy_risk_notes: null, status: "sent", source_snapshot_id: null, created_at: dateOffset(-4) },
];

// ---------------------------------------------------------------------------
// Tasks & approvals
// ---------------------------------------------------------------------------

export const TASKS: Task[] = [
  {
    id: "task-1", client_account_id: "client-tlc", title: "Xin chứng nhận FDA food-grade từ supplier Deli",
    description: "Gửi yêu cầu chứng nhận FDA cho lớp tráng trong bình 500ml trước khi chốt PO.",
    department: "sourcing", assignee_id: "u-sourcing", reviewer_id: "u-reviewer", priority: "high",
    status: "in_progress", due_at: dateOffset(-2), source_type: "risk_item", source_id: "risk-3",
    attachments: [], created_by: "u-research", created_at: dateOffset(-10), updated_at: dateOffset(-3), deleted_at: null, comments: [],
  },
  {
    id: "task-2", client_account_id: "client-tlc", title: "Test seal nắp phiên bản mới 100% mẫu",
    description: "Yêu cầu supplier gửi 50 sample nắp mới, test úp ngược 24h.",
    department: "sourcing", assignee_id: "u-sourcing", reviewer_id: null, priority: "urgent",
    status: "assigned", due_at: dateOffset(1), source_type: "risk_item", source_id: "risk-1",
    attachments: [], created_by: "u-research", created_at: dateOffset(-5), updated_at: dateOffset(-5), deleted_at: null, comments: [],
  },
  {
    id: "task-3", client_account_id: "client-eco", title: "Lên kế hoạch restock diffuser Q4",
    description: "Days of supply chỉ còn ~6 ngày, cần PO ngay để kịp trước Black Friday.",
    department: "inventory", assignee_id: "u-inventory", reviewer_id: "u-reviewer", priority: "urgent",
    status: "backlog", due_at: dateOffset(-1), source_type: "recommendation", source_id: null,
    attachments: [], created_by: "u-am", created_at: dateOffset(-4), updated_at: dateOffset(-4), deleted_at: null,
    comments: [
      { id: "tc-1", task_id: "task-3", author_id: "u-inventory", body: "Supplier báo còn hàng, có thể book 1200 pcs trong tuần này.", created_at: dateOffset(-2) },
    ],
  },
  {
    id: "task-4", client_account_id: "client-tlc", title: "Optimize listing pillow v2 sau 2 tuần",
    description: "Thêm keyword neck pain relief, viết lại bullets theo benefit-first.",
    department: "content", assignee_id: "u-content", reviewer_id: "u-reviewer", priority: "medium",
    status: "in_review", due_at: dateOffset(3), source_type: null, source_id: null,
    attachments: [], created_by: "u-am", created_at: dateOffset(-7), updated_at: dateOffset(-3), deleted_at: null, comments: [],
  },
  {
    id: "task-5", client_account_id: "client-eco", title: "Soạn báo cáo tuần 36 gửi client EcoBelly",
    description: "Báo cáo ACOS, TACOS, days of supply và kế hoạch tuần tới.",
    department: "management", assignee_id: "u-am", reviewer_id: null, priority: "medium",
    status: "assigned", due_at: dateOffset(2), source_type: null, source_id: null,
    attachments: [], created_by: "u-owner", created_at: dateOffset(-2), updated_at: dateOffset(-2), deleted_at: null, comments: [],
  },
  {
    id: "task-6", client_account_id: "client-mom", title: "Thu thập thêm review data cho máy tạo ẩm",
    description: "Cần review export tối thiểu 300 reviews để chạy AI review mining.",
    department: "research", assignee_id: "u-research", reviewer_id: null, priority: "low",
    status: "backlog", due_at: dateOffset(7), source_type: null, source_id: null,
    attachments: [], created_by: "u-am", created_at: dateOffset(-3), updated_at: dateOffset(-3), deleted_at: null, comments: [],
  },
  {
    id: "task-7", client_account_id: "client-tlc", title: "Khởi tạo chiến dịch launch SP cho bình giữ nhiệt",
    description: "Chuẩn bị campaign structure: exact core + auto discovery, budget $30/ngày.",
    department: "ppc", assignee_id: "u-ppc", reviewer_id: null, priority: "medium",
    status: "backlog", due_at: dateOffset(10), source_type: null, source_id: null,
    attachments: [], created_by: "u-am", created_at: dateOffset(-1), updated_at: dateOffset(-1), deleted_at: null, comments: [],
  },
];

export const APPROVALS: ApprovalRequest[] = [
  {
    id: "appr-1", client_account_id: "client-tlc", request_type: "product_decision",
    entity_type: "product_opportunity", entity_id: "opp-bottle",
    title: "Go/No-Go: Bình giữ nhiệt 500ml — đề xuất GO WITH CONDITIONS",
    payload_snapshot: { decision: "go_with_conditions", conditions: ["FDA cert trước PO", "Test seal nắp mới"] },
    requested_by: "u-research", reviewed_by: null, decision: "pending", decision_reason: null,
    expires_at: dateOffset(5), execution_status: "not_started", created_at: dateOffset(-2), decided_at: null,
  },
  {
    id: "appr-2", client_account_id: "client-tlc", request_type: "cost_profile",
    entity_type: "cost_profile", entity_id: "cp-bottle-1",
    title: "Duyệt cost profile bình giữ nhiệt (base scenario)",
    payload_snapshot: { sku: "TV-BTL-500-ST", selling_price: 26.99, margin: "13.8%" },
    requested_by: "u-finance", reviewed_by: null, decision: "pending", decision_reason: null,
    expires_at: dateOffset(7), execution_status: "not_started", created_at: dateOffset(-3), decided_at: null,
  },
  {
    id: "appr-3", client_account_id: "client-eco", request_type: "customer_response",
    entity_type: "customer_message", entity_id: "msg-4",
    title: "Duyệt reply: KH yêu cầu refund qua PayPal",
    payload_snapshot: { reply: "We truly appreciate your patience! ..." },
    requested_by: "u-cs", reviewed_by: null, decision: "pending", decision_reason: null,
    expires_at: dateOffset(1), execution_status: "not_started", created_at: dateOffset(-1), decided_at: null,
  },
  {
    id: "appr-4", client_account_id: "client-tlc", request_type: "listing_publish",
    entity_type: "listing_version", entity_id: "lv-pillow-2",
    title: "Publish listing pillow v2 (optimize keywords)",
    payload_snapshot: { version: 2, asin: "B0PILLOW01" },
    requested_by: "u-content", reviewed_by: null, decision: "pending", decision_reason: null,
    expires_at: dateOffset(3), execution_status: "not_started", created_at: dateOffset(-1), decided_at: null,
  },
  {
    id: "appr-5", client_account_id: "client-tlc", request_type: "product_decision",
    entity_type: "product_opportunity", entity_id: "opp-pillow",
    title: "Go/No-Go: Gối memory foam cổ — GO",
    payload_snapshot: { decision: "go" },
    requested_by: "u-research", reviewed_by: "u-reviewer", decision: "approved",
    decision_reason: "Margin 28%, supplier đạt sample, rủi ro thấp.",
    expires_at: null, execution_status: "executed", created_at: dateOffset(-31), decided_at: dateOffset(-30),
  },
];

// ---------------------------------------------------------------------------
// Recommendations & AI runs (generated by the rules engine at seed time)
// ---------------------------------------------------------------------------

export const RECOMMENDATIONS: Recommendation[] = (() => {
  const aggs = CAMPAIGNS.map((c) =>
    aggregateCampaignMetrics(c, AD_METRICS.filter((m) => m.campaign_id === c.id))
  );
  return generatePpcRecommendations(aggs).concat([
    {
      id: "rec-inv-diffuser", client_account_id: "client-eco", module: "inventory",
      recommendation_type: "stockout_risk", title: "SKU EB-DIFF-300-WD sắp hết hàng",
      explanation: "Days of supply ~5.7 ngày, dưới lead time tổng 75 ngày. Cần expedite (air) hoặc chấp nhận đứt hàng 1-2 tuần.",
      evidence_ids: ["inv-3"], confidence: "high", impact: "high",
      proposed_action: { type: "create_reorder", sku_id: "sku-diffuser-wd", quantity: 1200, expedite: true },
      guardrails: { requiresApproval: true, maxOrderValue: 20000 },
      status: "pending_review", model_version: "rules-v1",
      created_at: dateOffset(-1), updated_at: dateOffset(-1),
    },
  ]);
})();

export const AI_RUNS: AiRunSeed[] = [
  {
    id: "air-1", client_account_id: "client-tlc", use_case: "market_summary",
    model_name: "heuristic-engine", prompt_version: "market-v1",
    input_record_ids: ["src-bottle-1", "src-bottle-2"], status: "succeeded", reviewed_by: null,
    output: { summary: "Nhu cầu bình giữ nhiệt 500ml ổn định…", missing_data: ["Chi phí storage thực tế"] },
    created_at: dateOffset(-18),
  },
  {
    id: "air-2", client_account_id: "client-tlc", use_case: "review_mining",
    model_name: "heuristic-engine", prompt_version: "review-v1",
    input_record_ids: ["src-bottle-3"], status: "succeeded", reviewed_by: "u-reviewer",
    output: { summary: "4 nhóm insight: rò nước, giữ nhiệt tốt, sơn bong, size lớn hơn…", missing_data: [] },
    created_at: dateOffset(-17),
  },
];

export interface AiRunSeed {
  id: string;
  client_account_id: string;
  use_case: string;
  model_name: string;
  prompt_version: string;
  input_record_ids: string[];
  status: "pending" | "succeeded" | "failed" | "insufficient_evidence";
  reviewed_by: string | null;
  output: Record<string, unknown>;
  created_at: string;
}

export const AUDIT_EVENTS: AuditEvent[] = [
  { id: "aud-1", organization_id: ORG_ID, client_account_id: "client-tlc", actor_user_id: "u-research", action: "product_opportunities.insert", entity_type: "product_opportunities", entity_id: "opp-bottle", before_json: null, after_json: { name: "Bình giữ nhiệt 500ml", stage: "idea" }, ip_hash: "h1", created_at: dateOffset(-24) },
  { id: "aud-2", organization_id: ORG_ID, client_account_id: "client-tlc", actor_user_id: "u-finance", action: "cost_profiles.insert", entity_type: "cost_profiles", entity_id: "cp-bottle-1", before_json: null, after_json: { status: "pending_approval" }, ip_hash: "h2", created_at: dateOffset(-3) },
  { id: "aud-3", organization_id: ORG_ID, client_account_id: "client-tlc", actor_user_id: "u-content", action: "listing_versions.insert", entity_type: "listing_versions", entity_id: "lv-pillow-2", before_json: null, after_json: { version: 2, status: "internal_review" }, ip_hash: "h3", created_at: dateOffset(-3) },
  { id: "aud-4", organization_id: ORG_ID, client_account_id: "client-tlc", actor_user_id: "u-reviewer", action: "approval_requests.update", entity_type: "approval_requests", entity_id: "appr-5", before_json: { decision: "pending" }, after_json: { decision: "approved" }, ip_hash: "h4", created_at: dateOffset(-30) },
  { id: "aud-5", organization_id: ORG_ID, client_account_id: "client-eco", actor_user_id: "u-cs", action: "customer_messages.update", entity_type: "customer_messages", entity_id: "msg-4", before_json: { status: "new" }, after_json: { status: "pending_approval" }, ip_hash: "h5", created_at: dateOffset(-1) },
];
