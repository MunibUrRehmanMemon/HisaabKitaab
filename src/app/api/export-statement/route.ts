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

    // Calculate date range
    let dateStart: string;
    let dateEnd: string;
    const now = new Date();

    if (period === "custom" && startDate && endDate) {
      dateStart = startDate;
      dateEnd = endDate;
    } else if (period === "weekly") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateStart = weekAgo.toISOString().split("T")[0];
      dateEnd = now.toISOString().split("T")[0];
    } else {
      // monthly (default)
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      dateEnd = now.toISOString().split("T")[0];
    }

    // Fetch transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, type, amount, category_id, categories(name_en, name_ur), description_en, description_ur, transaction_date, source, created_at"
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
    }));

    // CSV export
    if (format === "csv") {
      const csvHeader = "Date,Type,Amount (PKR),Category,Description,Source";
      const csvRows = formattedTransactions.map(
        (t) =>
          `${t.date},${t.type},${t.amount},"${t.category}","${t.description.replace(/"/g, '""')}",${t.source}`
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
        accountMode: account.mode,
        userName: profile.full_name || profile.email || "User",
        period: { start: dateStart, end: dateEnd, type: period },
        generatedAt: new Date().toISOString(),
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
