import { forbidden, hasRole, unauthorized, userFromRequest } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getDoc, listDocs, putDoc } from "@/lib/store";
import type { Payment, User } from "@/lib/types";

export async function GET(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "moderator")) return forbidden();
  const url = new URL(req.url);
  const withProof = url.searchParams.get("proof");
  let payments = (await listDocs<Payment>("payments")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  if (withProof) {
    // Return the full record (including receipt image) for a single payment.
    payments = payments.filter((p) => p.id === withProof);
    return Response.json({ payments });
  }
  return Response.json({ payments: payments.map((p) => ({ ...p, proofDataUrl: undefined, hasProof: !!p.proofDataUrl })) });
}

/**
 * Review a payment: approving activates the plan's subscription on the user
 * and grants the plan's tokens — the manual step this business model runs on.
 */
export async function PATCH(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "moderator")) return forbidden();
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const decision = body?.decision === "approved" ? "approved" : body?.decision === "rejected" ? "rejected" : null;
  if (!id || !decision) return Response.json({ error: "id and decision required." }, { status: 400 });

  const payment = await getDoc<Payment>("payments", id);
  if (!payment) return Response.json({ error: "Payment not found." }, { status: 404 });
  if (payment.status !== "pending") {
    return Response.json({ error: "This payment was already reviewed." }, { status: 409 });
  }

  payment.status = decision;
  payment.reviewedAt = new Date().toISOString();
  payment.reviewedBy = `@${admin.username}`;
  if (typeof body.adminNote === "string" && body.adminNote.trim()) {
    payment.adminNote = body.adminNote.trim();
  }
  await putDoc("payments", payment);

  if (decision === "approved") {
    const user = await getDoc<User>("users", payment.userId);
    const settings = await getSettings();
    const plan = settings.plans.find((p) => p.id === payment.planId);
    if (user && plan) {
      const base =
        user.subscription && new Date(user.subscription.expiresAt).getTime() > Date.now()
          ? new Date(user.subscription.expiresAt)
          : new Date();
      user.subscription = {
        planId: plan.id,
        planName: plan.name,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(base.getTime() + plan.days * 86400_000).toISOString(),
      };
      user.tokens += plan.tokens;
      await putDoc("users", user);
    }
  }
  return Response.json({ payment: { ...payment, proofDataUrl: undefined } });
}
