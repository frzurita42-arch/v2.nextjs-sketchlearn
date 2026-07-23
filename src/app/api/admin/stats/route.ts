import { forbidden, hasRole, unauthorized, userFromRequest } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai";
import { listDocs } from "@/lib/store";
import type { Payment, Repo, Run, SlideTool, User } from "@/lib/types";

export async function GET(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "moderator")) return forbidden();
  const [users, repos, tools, runs, payments] = await Promise.all([
    listDocs<User>("users"),
    listDocs<Repo>("repos"),
    listDocs<SlideTool>("tools"),
    listDocs<Run>("runs"),
    listDocs<Payment>("payments"),
  ]);
  const weekAgo = Date.now() - 7 * 86400_000;
  const revenue = payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + p.amount, 0);
  return Response.json({
    stats: {
      users: users.length,
      activeSubscriptions: users.filter(
        (u) => u.subscription && new Date(u.subscription.expiresAt).getTime() > Date.now()
      ).length,
      repos: repos.length,
      tools: tools.length,
      runs: runs.length,
      runsThisWeek: runs.filter((r) => new Date(r.playedAt).getTime() > weekAgo).length,
      pendingPayments: payments.filter((p) => p.status === "pending").length,
      approvedRevenue: revenue,
      aiConfigured: await aiAvailable(),
    },
  });
}
