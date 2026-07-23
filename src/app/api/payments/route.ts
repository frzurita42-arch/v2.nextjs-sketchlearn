import { unauthorized, userFromRequest } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { listDocs, newId, putDoc } from "@/lib/store";
import type { Payment } from "@/lib/types";

// Manual payment flow: the user transfers money outside the site, then
// submits proof (a receipt image + reference). An admin reviews the queue and
// activates the subscription by hand.

const MAX_PROOF_BYTES = 4 * 1024 * 1024; // ~4MB data URL

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const payments = (await listDocs<Payment>("payments"))
    .filter((p) => p.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({ ...p, proofDataUrl: undefined }));
  return Response.json({ payments });
}

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized("Sign in to submit a payment.");
  const body = await req.json().catch(() => null);
  const planId = typeof body?.planId === "string" ? body.planId : "";
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const proofDataUrl = typeof body?.proofDataUrl === "string" ? body.proofDataUrl : "";

  const settings = await getSettings();
  const plan = settings.plans.find((p) => p.id === planId);
  if (!plan) return Response.json({ error: "Unknown plan." }, { status: 400 });
  if (!reference && !proofDataUrl) {
    return Response.json(
      { error: "Include a transfer reference or upload a receipt image." },
      { status: 400 }
    );
  }
  if (proofDataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(proofDataUrl)) {
    return Response.json({ error: "The receipt must be an image file." }, { status: 400 });
  }
  if (proofDataUrl.length > MAX_PROOF_BYTES) {
    return Response.json({ error: "Receipt image too large (max ~3MB)." }, { status: 400 });
  }

  const payment: Payment = {
    id: newId("pay"),
    userId: user.id,
    userName: `@${user.username}`,
    planId: plan.id,
    planName: plan.name,
    amount: plan.price,
    currency: plan.currency,
    reference,
    note: note || undefined,
    proofDataUrl: proofDataUrl || undefined,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await putDoc("payments", payment);
  return Response.json({ payment: { ...payment, proofDataUrl: undefined } });
}
