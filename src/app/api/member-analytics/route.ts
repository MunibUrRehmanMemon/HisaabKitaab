import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";

/**
 * GET /api/member-analytics — per-member spending breakdown for the family account
 * Returns: each member's income, expenses, transaction count, and category breakdown
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const {
      profile,
      account,
      error: setupError,
    } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json({ members: [], accountName: "" });
    }

    // Get all members including pending (NO FK join — separate queries)
    const { data: memberRows } = await supabase
      .from("account_members")
      .select("id, role, profile_id, invited_email, accepted")
      .eq("account_id", account.id)
      .order("joined_at", { ascending: true });

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ members: [], accountName: account.name });
    }

    // Fetch profiles separately
    const profileIds = memberRows.map((m: any) => m.profile_id).filter(Boolean);
    let profileMap: Record<string, any> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", profileIds);
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
      }
    }

    const members = memberRows;

    // Get this month's date range
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const today = now.toISOString().split("T")[0];

    // Get ALL transactions for this account this month
    const { data: allTx } = await supabase
      .from("transactions")
      .select(
        "type, amount, added_by, category_id, categories(name_en, color), transaction_date"
      )
      .eq("account_id", account.id)
      .gte("transaction_date", firstOfMonth)
      .lte("transaction_date", today);

    const transactions = allTx || [];

    // Also get all-time summaries per member
    const { data: allTimeTx } = await supabase
      .from("transactions")
      .select("type, amount, added_by")
      .eq("account_id", account.id);

    const allTimeTransactions = allTimeTx || [];

    // Build per-member analytics
    const memberAnalytics = members.map((m: any) => {
      const prof = m.profile_id ? profileMap[m.profile_id] : null;
      const profileId = m.profile_id;

      // This month
      const memberTx = transactions.filter((t: any) => t.added_by === profileId);
      const monthIncome = memberTx
        .filter((t: any) => t.type === "income")
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const monthExpenses = memberTx
        .filter((t: any) => t.type === "expense")
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Category breakdown for the member (expenses only, this month)
      const catMap: Record<string, { name: string; color: string; amount: number }> = {};
      for (const tx of memberTx) {
        if (tx.type === "expense") {
          const cat = (tx as any).categories;
          const catName = cat?.name_en || "Other";
          if (!catMap[catName]) {
            catMap[catName] = { name: catName, color: cat?.color || "#94A3B8", amount: 0 };
          }
          catMap[catName].amount += Number(tx.amount);
        }
      }

      // All time
      const allTimeMemberTx = allTimeTransactions.filter(
        (t: any) => t.added_by === profileId
      );
      const allTimeIncome = allTimeMemberTx
        .filter((t: any) => t.type === "income")
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const allTimeExpenses = allTimeMemberTx
        .filter((t: any) => t.type === "expense")
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      return {
        id: m.id,
        profileId,
        name: prof?.full_name || m.invited_email || prof?.email || "Unknown",
        email: prof?.email || m.invited_email || "",
        avatar: prof?.avatar_url || null,
        role: m.role,
        accepted: m.accepted ?? false,
        month: {
          income: Math.round(monthIncome),
          expenses: Math.round(monthExpenses),
          net: Math.round(monthIncome - monthExpenses),
          transactionCount: memberTx.length,
          categories: Object.values(catMap)
            .sort((a, b) => b.amount - a.amount)
            .map((c) => ({ ...c, amount: Math.round(c.amount) })),
        },
        allTime: {
          income: Math.round(allTimeIncome),
          expenses: Math.round(allTimeExpenses),
          balance: Math.round(allTimeIncome - allTimeExpenses),
          transactionCount: allTimeMemberTx.length,
        },
      };
    });

    return NextResponse.json({
      members: memberAnalytics,
      accountName: account.name,
    });
  } catch (error: any) {
    console.error("Error fetching member analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch member analytics", details: error.message },
      { status: 500 }
    );
  }
}
