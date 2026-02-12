import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";

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
        monthlyTrend: [],
        categoryBreakdown: [],
        dailySpending: [],
      });
    }

    // --- Monthly trend: last 6 months ---
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

    const { data: allTx } = await supabase
      .from("transactions")
      .select(
        "type, amount, transaction_date, category_id, categories(name_en, name_ur, icon, color)"
      )
      .eq("account_id", account.id)
      .gte("transaction_date", sixMonthsAgoStr)
      .order("transaction_date", { ascending: true });

    const transactions = allTx || [];

    // Build monthly trend
    const monthlyMap: Record<
      string,
      { month: string; income: number; expenses: number }
    > = {};
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Pre-fill 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[key] = {
        month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
        income: 0,
        expenses: 0,
      };
    }

    // Category breakdown (current month)
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const categoryMap: Record<
      string,
      { name: string; nameUr: string; color: string; amount: number }
    > = {};

    // Daily spending (current month)
    const dailyMap: Record<string, { date: string; amount: number }> = {};

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const dateStr = tx.transaction_date;
      const ym = dateStr.substring(0, 7); // YYYY-MM

      // Monthly trend
      if (monthlyMap[ym]) {
        if (tx.type === "income") {
          monthlyMap[ym].income += amount;
        } else {
          monthlyMap[ym].expenses += amount;
        }
      }

      // Category breakdown (current month expenses only)
      if (dateStr >= firstOfMonth && tx.type === "expense") {
        const cat = (tx as any).categories;
        const catName = cat?.name_en || "Other";
        if (!categoryMap[catName]) {
          categoryMap[catName] = {
            name: catName,
            nameUr: cat?.name_ur || "دیگر",
            color: cat?.color || "#94A3B8",
            amount: 0,
          };
        }
        categoryMap[catName].amount += amount;
      }

      // Daily spending (current month)
      if (dateStr >= firstOfMonth && tx.type === "expense") {
        if (!dailyMap[dateStr]) {
          dailyMap[dateStr] = { date: dateStr, amount: 0 };
        }
        dailyMap[dateStr].amount += amount;
      }
    }

    // Round numbers
    const monthlyTrend = Object.values(monthlyMap).map((m) => ({
      ...m,
      income: Math.round(m.income),
      expenses: Math.round(m.expenses),
    }));

    const categoryBreakdown = Object.values(categoryMap)
      .sort((a, b) => b.amount - a.amount)
      .map((c) => ({ ...c, amount: Math.round(c.amount) }));

    const dailySpending = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date.substring(5), // MM-DD
        amount: Math.round(d.amount),
      }));

    return NextResponse.json({
      monthlyTrend,
      categoryBreakdown,
      dailySpending,
    });
  } catch (error: any) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics", details: error.message },
      { status: 500 }
    );
  }
}
