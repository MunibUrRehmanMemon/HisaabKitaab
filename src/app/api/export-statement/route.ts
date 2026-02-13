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

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "monthly"; // weekly | monthly | custom
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");
    const format = searchParams.get("format") || "json"; // json | csv

    const supabase = createServiceClient();

    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json({ error: setupError || "Account not found" }, { status: 404 });
    }

    // Calculate date range (using Pakistan Standard Time)
    let dateStart: string;
    let dateEnd: string;
    const todayPK = getTodayPKT();

    if (period === "custom" && startDate && endDate) {
      dateStart = startDate;
      dateEnd = endDate;
    } else if (period === "weekly") {
      // Calculate 7 days ago in PKT
      const [y, m, d] = todayPK.split("-").map(Number);
      const weekAgo = new Date(y, m - 1, d - 7);
      dateStart = weekAgo.toISOString().split("T")[0];
      dateEnd = todayPK;
    } else {
      // monthly (default)
      dateStart = getFirstOfMonthPKT();
      dateEnd = todayPK;
    }

    // Fetch transactions with added_by for member attribution
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, type, amount, category_id, categories(name_en, name_ur), description_en, description_ur, transaction_date, source, created_at, added_by"
      )
      .eq("account_id", account.id)
      .gte("transaction_date", dateStart)
      .lte("transaction_date", dateEnd)
      .order("transaction_date", { ascending: true });

    if (txError) {
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    const txList = transactions || [];

    // Look up ALL members of this account for the statement header
    const { data: memberRows } = await supabase
      .from("account_members")
      .select("profile_id, role, invited_email, accepted")
      .eq("account_id", account.id)
      .order("joined_at", { ascending: true });

    const memberProfileIds = (memberRows || []).map((m: any) => m.profile_id).filter(Boolean);
    let allProfileMap: Record<string, { name: string; email: string }> = {};
    if (memberProfileIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds);
      if (memberProfiles) {
        for (const p of memberProfiles) {
          allProfileMap[p.id] = { name: p.full_name || p.email || "Unknown", email: p.email || "" };
        }
      }
    }

    const members = (memberRows || []).map((m: any) => ({
      name: m.profile_id ? (allProfileMap[m.profile_id]?.name || "Unknown") : (m.invited_email || "Pending"),
      email: m.profile_id ? (allProfileMap[m.profile_id]?.email || m.invited_email || "") : (m.invited_email || ""),
      role: m.role,
      accepted: m.accepted,
    }));

    // Build profile name map for transaction attribution (reusing allProfileMap)
    let profileNameMap: Record<string, string> = {};
    for (const [id, prof] of Object.entries(allProfileMap)) {
      profileNameMap[id] = prof.name;
    }

    // Calculate totals
    const totalIncome = txList
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalExpenses = txList
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Category breakdown
    const categoryBreakdown: Record<string, { income: number; expense: number }> = {};
    for (const t of txList) {
      const catName = (t as any).categories?.name_en || "Other";
      if (!categoryBreakdown[catName]) {
        categoryBreakdown[catName] = { income: 0, expense: 0 };
      }
      categoryBreakdown[catName][t.type as "income" | "expense"] += Number(t.amount);
    }

    const formattedTransactions = txList.map((t: any) => ({
      date: t.transaction_date,
      type: t.type,
      amount: Number(t.amount),
      category: t.categories?.name_en || "Other",
      categoryUr: t.categories?.name_ur || "دیگر",
      description: t.description_en || "",
      descriptionUr: t.description_ur || "",
      source: t.source || "manual",
      addedBy: t.added_by ? (profileNameMap[t.added_by] || "Unknown") : profile.full_name || profile.email || "User",
    }));

    // CSV export
    if (format === "csv") {
      const csvHeader = "Date,Type,Amount (PKR),Category,Description,Source,Added By";
      const csvRows = formattedTransactions.map(
        (t) =>
          `${t.date},${t.type},${t.amount},"${t.category}","${t.description.replace(/"/g, '""')}",${t.source},"${t.addedBy}"`
      );
      const csvContent = [csvHeader, ...csvRows].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="HisaabKitaab_Statement_${dateStart}_to_${dateEnd}.csv"`,
        },
      });
    }

    // JSON response
    return NextResponse.json({
      statement: {
        accountName: account.name,
        accountType: members.length > 1 ? "Family Account" : "Personal Account",
        userName: profile.full_name || profile.email || "User",
        period: { start: dateStart, end: dateEnd, type: period },
        generatedAt: new Date().toISOString(),
        members,
      },
      summary: {
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        transactionCount: txList.length,
        categoryBreakdown,
      },
      transactions: formattedTransactions,
    });
  } catch (error: any) {
    console.error("Error generating statement:", error);
    return NextResponse.json(
      { error: "Failed to generate statement", details: error.message },
      { status: 500 }
    );
  }
}
