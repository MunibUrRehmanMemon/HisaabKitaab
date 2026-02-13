import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";
import { getTodayPKT, getFirstOfMonthPKT } from "@/lib/date-utils";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json({
        totalIncome: 0,
        totalExpenses: 0,
        netCashFlow: 0,
        balance: 0,
        recentTransactions: [],
        transactionCount: 0,
      });
    }

    // Get this month's date range in Pakistan Standard Time (UTC+5)
    const today = getTodayPKT();
    const firstOfMonth = getFirstOfMonthPKT();

    // Get this month's transactions
    const { data: monthTransactions } = await supabase
      .from("transactions")
      .select("type, amount, category_id, categories(name_en, name_ur, icon, color), description_en, description_ur, transaction_date, source, created_at")
      .eq("account_id", account.id)
      .gte("transaction_date", firstOfMonth)
      .lte("transaction_date", today)
      .order("transaction_date", { ascending: false });

    const transactions = monthTransactions || [];

    const totalIncome = transactions
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalExpenses = transactions
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Get ALL transactions for overall balance
    const { data: allTransactions } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("account_id", account.id);

    const allIncome = (allTransactions || [])
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const allExpenses = (allTransactions || [])
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Get recent transactions (last 10) — include added_by for member attribution
    const { data: recentTransactions } = await supabase
      .from("transactions")
      .select("id, type, amount, category_id, categories(name_en, name_ur, icon, color), description_en, description_ur, transaction_date, source, created_at, added_by")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Look up profile names for added_by
    const addedByIds = [...new Set(
      (recentTransactions || []).map((t: any) => t.added_by).filter(Boolean)
    )];
    let profileNameMap: Record<string, string> = {};
    if (addedByIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", addedByIds);
      if (profiles) {
        for (const p of profiles) {
          profileNameMap[p.id] = p.full_name || p.email || "Unknown";
        }
      }
    }

    return NextResponse.json({
      totalIncome,
      totalExpenses,
      netCashFlow: totalIncome - totalExpenses,
      balance: allIncome - allExpenses,
      recentTransactions: (recentTransactions || []).map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        category: t.categories?.name_en || "Other",
        categoryUr: t.categories?.name_ur || "دیگر",
        icon: t.categories?.icon || "circle-dot",
        color: t.categories?.color || "#94A3B8",
        description: t.description_en || "",
        descriptionUr: t.description_ur || "",
        date: t.transaction_date,
        source: t.source,
        addedBy: t.added_by ? (profileNameMap[t.added_by] || "Unknown") : null,
      })),
      transactionCount: transactions.length,
    });
  } catch (error: any) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data", details: error.message },
      { status: 500 }
    );
  }
}
