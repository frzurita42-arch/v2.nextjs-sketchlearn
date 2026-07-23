import { getSettings } from "@/lib/settings";

/** Public: plans + manual-payment instructions for the pricing page. */
export async function GET() {
  const s = await getSettings();
  return Response.json({
    plans: s.plans,
    paymentInstructions: s.paymentInstructions,
    paymentSheetUrl: s.paymentSheetUrl,
  });
}
