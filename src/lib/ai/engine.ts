/**
 * AI Analysis Layer — spec §5.3.
 *
 * MVP implementation: a deterministic heuristic engine that produces the
 * structured output contract (summary / findings / missing_data / risks /
 * next_actions) with evidence IDs and confidence. When AI_PROVIDER_* env
 * vars are configured, callAiProvider() delegates to an OpenAI-compatible
 * endpoint server-side; the heuristic engine remains the fallback and the
 * source of prompt contracts.
 *
 * Hard rules encoded here (spec §5.3, §12):
 *  - No conclusion without minimum input → return insufficient_evidence.
 *  - Provider estimates are never labeled as actual sales.
 *  - Every finding cites evidence (source/competitor/insight IDs).
 *  - Confidence + missing evidence are always part of the output.
 *  - The engine never executes actions; it only suggests.
 */

import type {
  AiStructuredOutput,
  CompetitorProduct,
  Finding,
  ListingVersion,
  ReviewInsight,
  RiskItem,
} from "../types";
import type { OpportunityDetail } from "../data/adapter";
import { computeEconomics } from "../domain/economics";

export const PROMPT_VERSIONS = {
  market_summary: "market-v1",
  review_mining: "review-v1",
  listing_audit: "listing-v1",
  message_classify: "message-v1",
} as const;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Market summary (spec §5.3 use case 1)
// ---------------------------------------------------------------------------

export function marketSummary(detail: OpportunityDetail): AiStructuredOutput {
  const { competitors, sources, economics, risks } = detail;
  const findings: Finding[] = [];

  if (competitors.length < 3) {
    return {
      summary: "Chưa đủ dữ liệu để tạo market summary.",
      findings: [],
      missing_data: [
        "Cần tối thiểu 3 đối thủ (hiện có " + competitors.length + ")",
        "Cần ít nhất 1 nguồn dữ liệu demand (H10/JS/SellerSprite export)",
      ],
      risks: ["Đánh giá dựa trên dữ liệu thiếu có thể dẫn tới quyết định sai"],
      next_actions: ["Import competitor data từ công cụ research"],
    };
  }

  const medSales = median(competitors.map((c) => c.monthly_sales ?? 0).filter((n) => n > 0));
  const medPrice = median(competitors.map((c) => c.price ?? 0).filter((n) => n > 0));
  const medReviews = median(competitors.map((c) => c.review_count ?? 0).filter((n) => n > 0));
  const top = competitors.reduce((a, b) => ((b.review_count ?? 0) > (a.review_count ?? 0) ? b : a));
  const lowRated = competitors.filter((c) => (c.rating ?? 5) < 4.2);

  if (medSales !== null) {
    findings.push({
      type: "observed",
      claim: `Median doanh thu ước tính của ${competitors.length} đối thủ ~${Math.round(medSales)} đơn/tháng (ESTIMATE từ provider, không phải sales thực tế).`,
      evidence_ids: competitors.map((c) => c.id),
      confidence: competitors.length >= 5 ? "high" : "medium",
      impact: "high",
      recommended_action: "Đối chiếu với ít nhất 1 nguồn thứ hai trước khi dùng cho forecast",
    });
  }
  if (medPrice !== null) {
    findings.push({
      type: "derived",
      claim: `Giá median ~$${medPrice.toFixed(2)}; định vị giá đề xuất $${(detail.opportunity.target_price ?? medPrice).toFixed(2)}.`,
      evidence_ids: competitors.map((c) => c.id),
      confidence: "high",
      impact: "medium",
      recommended_action: "Chạy economics với giá median và giá đề xuất để so sánh",
    });
  }
  if ((top.review_count ?? 0) > 10000) {
    findings.push({
      type: "ai_interpretation",
      claim: `Đối thủ đầu bảng (${top.title}) có ${top.review_count?.toLocaleString()} reviews — rào cản social proof cao.`,
      evidence_ids: [top.id],
      confidence: "high",
      impact: "high",
      recommended_action: "Định vị khác biệt (biến thể size/màu/feature) thay vì đối đầu trực tiếp",
    });
  }
  if (lowRated.length >= 2) {
    findings.push({
      type: "ai_interpretation",
      claim: `${lowRated.length}/${competitors.length} đối thủ có rating < 4.2 — tín hiệu cơ hội cải thiện chất lượng.`,
      evidence_ids: lowRated.map((c) => c.id),
      confidence: "medium",
      impact: "medium",
      recommended_action: "Đào review pain-points của chính các đối thủ này",
    });
  }

  const staleSources = sources.filter((s) => daysSince(s.captured_at) > 14);
  const missing: string[] = [];
  if (!economics) missing.push("Cost profile chưa có — chưa tính được contribution margin");
  if (sources.length === 0) missing.push("Chưa gắn source snapshot cho dữ liệu");
  if (staleSources.length === sources.length && sources.length > 0) {
    missing.push("Toàn bộ nguồn dữ liệu đã cũ (>14 ngày) — cần capture lại");
  }

  const riskTexts = risks
    .filter((r) => r.status === "open")
    .map((r) => `${r.description} (${r.severity})`);

  const summary =
    `Ngách "${detail.opportunity.name}": ${competitors.length} đối thủ, median ~${Math.round(medSales ?? 0)} đơn/tháng (estimate), ` +
    `giá median ~$${(medPrice ?? 0).toFixed(2)}, ` +
    `${(top.review_count ?? 0).toLocaleString()} reviews ở đầu bảng. ` +
    (lowRated.length >= 2 ? `Có ${lowRated.length} đối thủ yếu về rating → cơ hội khác biệt hóa chất lượng. ` : "") +
    (economics ? "Đã có cost profile để tính margin. " : "Chưa có cost profile. ");

  return {
    summary,
    findings,
    missing_data: missing,
    risks: riskTexts,
    next_actions: [
      economics ? "Chạy review mining để tìm điểm khác biệt hóa" : "Tạo cost profile base scenario",
      staleSources.length > 0 ? "Capture lại dữ liệu đã cũ (>14 ngày)" : "Bổ sung search volume data nếu có",
    ],
  };
}

// ---------------------------------------------------------------------------
// Review pain-point mining (spec §5.3 use case 3)
// ---------------------------------------------------------------------------

export function reviewMining(detail: OpportunityDetail): AiStructuredOutput {
  const { reviewInsights, competitors, sources } = detail;
  const reviewSources = sources.filter((s) =>
    ["file", "report_export"].includes(s.source_type)
  );

  if (reviewInsights.length === 0) {
    return {
      summary: "Chưa có review insight nào.",
      findings: [],
      missing_data: [
        "Cần import review export (CSV) từ Amazon hoặc công cụ research",
        `Hiện chỉ có ${reviewSources.length} nguồn dạng file`,
      ],
      risks: ["Không thấy pain point → khó tìm góc khác biệt hóa"],
      next_actions: ["Upload review export và chạy lại phân tích"],
    };
  }

  const sorted = [...reviewInsights].sort((a, b) => b.frequency - a.frequency);
  const negative = sorted.filter((i) => i.sentiment === "negative");
  const positive = sorted.filter((i) => i.sentiment === "positive");
  const findings: Finding[] = sorted.map((i) => ({
    type: i.ai_confidence === "high" ? "observed" : "ai_interpretation",
    claim:
      i.sentiment === "negative"
        ? `PAIN POINT "${i.theme}": xuất hiện trong ${i.frequency} reviews (${i.evidence_count} ví dụ cụ thể).`
        : `ĐIỂM MẠNH "${i.theme}": ${i.frequency} reviews đề cập tích cực.`,
    evidence_ids: i.source_id ? [i.source_id, i.id] : [i.id],
    confidence: i.ai_confidence,
    impact: i.sentiment === "negative" && i.frequency >= 50 ? "high" : "medium",
    recommended_action:
      i.sentiment === "negative"
        ? "Đưa vào checklist yêu cầu cải tiến với supplier + nhấn mạnh ở listing"
        : "Giữ nguyên tính năng này, đưa lên bullet đầu tiên",
  }));

  const topPain = negative[0];
  const summary =
    `Đào được ${sorted.length} nhóm insight từ review: ${negative.length} pain point, ${positive.length} điểm mạnh. ` +
    (topPain
      ? `Pain point lớn nhất: "${topPain.theme}" (${topPain.frequency} lượt). `
      : "") +
    (positive[0] ? `Điểm mạnh được khen nhiều nhất: "${positive[0].theme}". ` : "");

  const missing: string[] = [];
  if (reviewSources.some((s) => daysSince(s.captured_at) > 30)) {
    missing.push("Một số review export đã cũ (>30 ngày)");
  }
  const totalReviews = competitors.reduce((s, c) => s + (c.review_count ?? 0), 0);
  const covered = sorted.reduce((s, i) => s + i.frequency, 0);
  if (totalReviews > 0 && covered / totalReviews < 0.1) {
    missing.push(`Insight chỉ phủ ~${Math.round((covered / totalReviews) * 100)}% tổng review của các đối thủ`);
  }

  return {
    summary,
    findings,
    missing_data: missing,
    risks: negative.filter((i) => i.frequency >= 30).map((i) => i.theme),
    next_actions: [
      topPain ? `Yêu cầu supplier giải quyết: ${topPain.theme}` : "Theo dõi thêm review mới",
      "Tạo task content: đưa giải pháp pain point vào bullets",
    ],
  };
}

// ---------------------------------------------------------------------------
// Listing audit (spec §5.3 use case 5)
// ---------------------------------------------------------------------------

export interface ListingAuditInput {
  version: ListingVersion;
  previous?: ListingVersion | null;
  keywordBrief?: string[];
}

export function listingAudit(input: ListingAuditInput): AiStructuredOutput {
  const v = input.version;
  const findings: Finding[] = [];
  const missing: string[] = [];
  const title = v.title ?? "";
  const bullets = v.bullets ?? [];
  const description = v.description ?? "";

  // Title length check (Amazon guideline ~200 chars max, sweet spot 120-200)
  if (title.length > 0 && title.length < 80) {
    findings.push({
      type: "observed",
      claim: `Title chỉ ${title.length} ký tự — ngắn hơn khoảng tối ưu 120–200.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "medium",
      recommended_action: "Bổ sung keyword + benefit vào title",
    });
  } else if (title.length > 200) {
    findings.push({
      type: "observed",
      claim: `Title ${title.length} ký tự — vượt 200, có thể bị truncate ở mobile.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "medium",
      recommended_action: "Rút gọn, đưa keyword chính lên đầu",
    });
  }

  if (bullets.length < 5) {
    findings.push({
      type: "observed",
      claim: `Chỉ có ${bullets.length}/5 bullets — bỏ lỡ không gian nội dung.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "medium",
      recommended_action: "Viết đủ 5 bullets, bullet đầu nhấn strongest benefit",
    });
  }
  const benefitStart = bullets.filter((b) => /^[A-Z0-9][A-Z\s\-!+0-9]{6,}/.test(b));
  if (bullets.length > 0 && benefitStart.length < Math.min(3, bullets.length)) {
    findings.push({
      type: "ai_interpretation",
      claim: `${benefitStart.length}/${bullets.length} bullets mở đầu bằng benefit/keyword viết hoa — nên chuẩn hóa ALL-CAPS lead-in.`,
      evidence_ids: [v.id],
      confidence: "medium",
      impact: "low",
      recommended_action: "Viết lại bullets theo pattern BENEFIT — FEATURES — REASSURANCE",
    });
  }
  if (description.length < 200) {
    findings.push({
      type: "observed",
      claim: `Description ${description.length} ký tự — quá ngắn.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "low",
      recommended_action: "Mở rộng description với use cases",
    });
  }
  if ((v.backend_terms ?? []).length === 0) {
    missing.push("Chưa có backend search terms");
  }
  // Repetition detection: words repeated across title+bullets too often
  const words = `${title} ${bullets.join(" ")}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 4);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, n]) => n >= 4).map(([w]) => w);
  if (repeated.length > 0) {
    findings.push({
      type: "derived",
      claim: `Từ lặp lại ≥4 lần trong title + bullets: ${repeated.slice(0, 6).join(", ")} — nên đa dạng hóa từ khóa.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "low",
      recommended_action: "Thay bằng đồng nghĩa/backend terms",
    });
  }
  // Unsupported claim detection
  const banned = [/cure/i, /100% guaranteed/i, /medical grade/i, /best in the world/i, /FDA approved/i];
  const all = `${title} ${bullets.join(" ")} ${description}`;
  const hits = banned.filter((re) => re.test(all)).map((re) => re.source);
  if (hits.length > 0) {
    findings.push({
      type: "observed",
      claim: `Phát hiện claim rủi ro compliance: ${hits.join(", ")}.`,
      evidence_ids: [v.id],
      confidence: "high",
      impact: "high",
      recommended_action: "Gỡ bỏ claim chưa có chứng nhận — rủi ro bị suppress",
    });
  }
  if (input.previous) {
    findings.push({
      type: "derived",
      claim: `So với v${input.previous.version_number}: title ${title.length - input.previous.title.length >= 0 ? "+" : ""}${title.length - input.previous.title.length} ký tự, ${bullets.length - input.previous.bullets.length} bullets.`,
      evidence_ids: [v.id, input.previous.id],
      confidence: "high",
      impact: "low",
      recommended_action: "Kiểm tra diff trước khi submit",
    });
  }

  return {
    summary: `Audit listing v${v.version_number}: ${findings.length} phát hiện, ${missing.length} dữ liệu thiếu. ${
      findings.some((f) => f.impact === "high") ? "Có phát hiện impact cao cần xử lý trước khi publish." : "Không có blocker lớn."
    }`,
    findings,
    missing_data: missing,
    risks: hits.length > 0 ? ["Claim không có bằng chứng chứng nhận"] : [],
    next_actions: findings.length > 0 ? ["Sửa theo findings rồi submit duyệt"] : ["Sẵn sàng submit duyệt"],
  };
}

// ---------------------------------------------------------------------------
// Customer message classification + reply draft (spec §5.8)
// ---------------------------------------------------------------------------

export interface MessageClassification {
  intent: string;
  urgency: "low" | "medium" | "high" | "urgent";
  summary: string;
  policy_risk_level: "none" | "low" | "medium" | "high";
  policy_risk_notes: string[];
  reply_draft: string;
}

const POLICY_RISK_PATTERNS: { re: RegExp; note: string; level: "medium" | "high" }[] = [
  { re: /paypal|venmo|zelle|bank transfer|wire transfer/i, note: "Yêu cầu thanh toán/refund ngoài Amazon — vi phạm policy", level: "high" },
  { re: /change your review|remove (the )?review|edit (the )?review|update (the )?review/i, note: "Yêu cầu sửa/xóa review — vi phạm Amazon Community Guidelines", level: "high" },
  { re: /1 star|one star|negative review/i, note: "KH dọa review tiêu cực — trả lời theo de-escalation, không mặc cả review", level: "medium" },
  { re: /refund now|full refund immediately/i, note: "Áp lực refund ngay — kiểm tra eligibility trước khi cam kết", level: "medium" },
  { re: /email me at|call me at|whatsapp|telegram/i, note: "KH muốn liên hệ ngoài Amazon — không chuyển sang kênh ngoài", level: "high" },
  { re: /doctor|medical advice|prescription/i, note: "Câu hỏi y tế — không đưa tư vấn y khoa", level: "medium" },
];

const INTENT_PATTERNS: { re: RegExp; intent: string; urgency: "low" | "medium" | "high" | "urgent" }[] = [
  { re: /not (yet )?(received|arrived)|where is my (order|package)|delivery/i, intent: "shipping_issue", urgency: "urgent" },
  { re: /refund|return|money back/i, intent: "return_refund", urgency: "high" },
  { re: /stopped working|broke|broken|defect|faulty|not working|leak|crack/i, intent: "defect_complaint", urgency: "high" },
  { re: /smell|chemical|safe|material|bpa/i, intent: "product_question", urgency: "high" },
  { re: /review/i, intent: "review_request", urgency: "low" },
  { re: /size|dimension|compatible|how (do|does)|can i|question/i, intent: "product_question", urgency: "low" },
];

export function classifyMessage(text: string): MessageClassification {
  const risks = POLICY_RISK_PATTERNS.filter((p) => p.re.test(text));
  const intentMatch = INTENT_PATTERNS.find((p) => p.re.test(text));
  const intent = intentMatch?.intent ?? "other";
  let urgency = intentMatch?.urgency ?? "medium";
  if (risks.some((r) => r.level === "high")) urgency = "urgent";

  let summary =
    `Intent: ${intent.replace(/_/g, " ")} — ` +
    (intent === "shipping_issue"
      ? "KH chưa nhận được hàng / hỏi về tình trạng giao."
      : intent === "return_refund"
        ? "KH yêu cầu hoàn tiền / trả hàng."
        : intent === "defect_complaint"
          ? "KH báo lỗi sản phẩm."
          : intent === "product_question"
            ? "KH hỏi về sản phẩm."
            : "Cần đọc kỹ nội dung.");
  if (risks.length > 0) summary += ` ⚠ ${risks.length} rủi ro policy phát hiện.`;

  const reply = draftReplyForIntent(intent, risks.length > 0);

  return {
    intent,
    urgency,
    summary,
    policy_risk_level: risks.some((r) => r.level === "high")
      ? "high"
      : risks.length > 0
        ? "medium"
        : "none",
    policy_risk_notes: risks.map((r) => r.note),
    reply_draft: reply,
  };
}

function draftReplyForIntent(intent: string, hasRisk: boolean): string {
  const safe = "NOTE: đây là BẢN NHÁP — cần reviewer duyệt trước khi gửi (spec §5.8).";
  switch (intent) {
    case "shipping_issue":
      return (
        "Hi [Customer], thank you for reaching out, and I'm sorry your package hasn't arrived. " +
        "Let me check the tracking status right away and follow up with the carrier. " +
        "If it's confirmed lost, I'll guide you through the Amazon A-to-z process so you're fully protected. " + safe
      );
    case "return_refund":
      return (
        "Hi [Customer], thank you for your message. I'm sorry the product didn't work out. " +
        "You can request a return through Your Orders → Return or Replace Items, and we'll approve it promptly. " +
        "All refunds are processed through Amazon so your buyer protection stays active. " + safe
      );
    case "defect_complaint":
      return (
        "Hi [Customer], I'm really sorry your unit isn't working as expected. " +
        "Could you share a short video or photo of the issue? I'll check with our QC team immediately " +
        "and make it right through Amazon's return/replacement flow. " + safe
      );
    case "product_question":
      return (
        "Hi [Customer], great question! [Trả lời ngắn gọn dựa trên spec sheet]. " +
        "If you need anything else, I'm happy to help. " + safe
      );
    default:
      return "Hi [Customer], thank you for reaching out — [điền nội dung]. " + safe;
  }
}

// ---------------------------------------------------------------------------
// Optional external provider hook (server-side only, spec §7.4)
// ---------------------------------------------------------------------------

export async function callAiProvider(
  systemPrompt: string,
  userPayload: unknown
): Promise<AiStructuredOutput | null> {
  const baseUrl = process.env.AI_PROVIDER_BASE_URL;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  const model = process.env.AI_MODEL_NAME;
  if (!baseUrl || !apiKey || !model) return null;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as AiStructuredOutput;
  } catch {
    return null;
  }
}
