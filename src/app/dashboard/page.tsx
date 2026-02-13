"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useTranslations } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Scan,
  Mic,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Loader2,
  FileText,
  BarChart3,
  Users,
  Crown,
  Shield,
  Eye,
  Pencil,
  Check,
  X,
  Settings,
} from "lucide-react";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/stores/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  balance: number;
  recentTransactions: Transaction[];
  transactionCount: number;
}

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  categoryUr: string;
  icon: string;
  color: string;
  description: string;
  descriptionUr: string;
  date: string;
  source: string;
  addedBy?: string | null;
}

interface AnalyticsData {
  monthlyTrend: { month: string; income: number; expenses: number }[];
  categoryBreakdown: { name: string; nameUr: string; color: string; amount: number }[];
  dailySpending: { date: string; amount: number }[];
}

interface MemberData {
  id: string;
  profileId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  accepted: boolean;
  month: {
    income: number;
    expenses: number;
    net: number;
    transactionCount: number;
    categories: { name: string; color: string; amount: number }[];
  };
  allTime: {
    income: number;
    expenses: number;
    balance: number;
    transactionCount: number;
  };
}

interface MemberAnalyticsData {
  members: MemberData[];
  accountName: string;
}

const CHART_COLORS = [
  "#0F766E", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#10B981",
];

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-PK");
}

export default function DashboardPage() {
  const { user } = useUser();
  const t = useTranslations();
  const router = useRouter();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [memberAnalytics, setMemberAnalytics] = useState<MemberAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const fetchMemberAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/member-analytics", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMemberAnalytics(data);
      }
    } catch (error: any) {
      console.error("Error fetching member analytics:", error);
    }
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Ensure profile exists
        await fetch("/api/ensure-profile", { method: "POST" });
        
        // Fetch dashboard stats, analytics, and member data in parallel
        const [statsRes, analyticsRes] = await Promise.all([
          fetch("/api/dashboard-stats", { cache: "no-store" }),
          fetch("/api/analytics", { cache: "no-store" }),
        ]);
        
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setAnalytics(data);
        }

        // Fetch member analytics (non-blocking)
        fetchMemberAnalytics();
      } catch (error: any) {
        console.error("Error loading dashboard:", error);
        toast({
          title: "Dashboard load error",
          description: error?.message || "Failed to load dashboard data. Please refresh the page.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [fetchMemberAnalytics]);

  const handleSaveName = async (memberId: string) => {
    setSavingName(true);
    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, name: editName }),
      });
      if (res.ok) {
        fetchMemberAnalytics();
        setEditingMember(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast({
          title: "Failed to update name",
          description: errData.error || "Could not save name. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error saving member name:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save name. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="h-3 w-3 text-amber-500" />;
      case "admin": return <Shield className="h-3 w-3 text-blue-500" />;
      case "viewer": return <Eye className="h-3 w-3 text-gray-400" />;
      default: return <Users className="h-3 w-3 text-emerald-500" />;
    }
  };

  const income = stats?.totalIncome ?? 0;
  const expenses = stats?.totalExpenses ?? 0;
  const netCashFlow = stats?.netCashFlow ?? 0;
  const balance = stats?.balance ?? 0;
  const recentTransactions = stats?.recentTransactions ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <HisaabKitaabLogo className="h-8 w-8 sm:h-10 sm:w-10" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-primary">
                {t("common.appName")}
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">حساب کتاب</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Welcome */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">
            {t("dashboard.welcome", { name: user?.firstName || "there" })}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {t("dashboard.stats.thisMonth")}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mb-6 sm:mb-8 grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("dashboard.stats.totalIncome")}
              </CardTitle>
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-green-600">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("common.currency")} ${formatAmount(income)}`}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {t("dashboard.stats.thisMonth")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("dashboard.stats.totalExpenses")}
              </CardTitle>
              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-red-600">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("common.currency")} ${formatAmount(expenses)}`}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {t("dashboard.stats.thisMonth")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("dashboard.stats.netCashFlow")}
              </CardTitle>
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg sm:text-2xl font-bold ${netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("common.currency")} ${formatAmount(netCashFlow)}`}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {t("dashboard.stats.thisMonth")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("dashboard.stats.balance")}
              </CardTitle>
              <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg sm:text-2xl font-bold ${balance >= 0 ? "text-primary" : "text-red-600"}`}>
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("common.currency")} ${formatAmount(balance)}`}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 sm:mb-8">
          <h3 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold">
            {t("dashboard.quickActions")}
          </h3>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5">
            <Button
              variant="outline"
              className="h-20 sm:h-24 flex-col gap-1 sm:gap-2"
              onClick={() => router.push("/transactions/new")}
            >
              <Plus className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs sm:text-sm">{t("dashboard.addTransaction")}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 sm:h-24 flex-col gap-1 sm:gap-2"
              onClick={() => router.push("/scan")}
            >
              <Scan className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs sm:text-sm">{t("dashboard.scanBill")}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 sm:h-24 flex-col gap-1 sm:gap-2"
              onClick={() => router.push("/voice")}
            >
              <Mic className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs sm:text-sm">{t("dashboard.voiceEntry")}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 sm:h-24 flex-col gap-1 sm:gap-2"
              onClick={() => router.push("/advisor")}
            >
              <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs sm:text-sm">{t("dashboard.askAdvisor")}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 sm:h-24 flex-col gap-1 sm:gap-2"
              onClick={() => router.push("/statements")}
            >
              <FileText className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs sm:text-sm">Statements</span>
            </Button>
          </div>
        </div>

        {/* Analytics Charts */}
        {!isLoading && analytics && (
          <div className="mb-6 sm:mb-8">
            <h3 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Analytics
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Income vs Expenses Bar Chart */}
              {analytics.monthlyTrend.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Income vs Expenses (6 Months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v.split(" ")[0]}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                          />
                          <Tooltip
                            formatter={(value: any, name: any) => [
                              `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                              String(name).charAt(0).toUpperCase() + String(name).slice(1),
                            ]}
                            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                          />
                          <Bar dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} name="Income" />
                          <Bar dataKey="expenses" fill="#dc2626" radius={[4, 4, 0, 0]} name="Expenses" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Category Breakdown Pie Chart */}
              {analytics.categoryBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Expense Categories (This Month)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.categoryBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="amount"
                            nameKey="name"
                            label={({ name, percent }: any) =>
                              `${name} ${((percent || 0) * 100).toFixed(0)}%`
                            }
                            labelLine={false}
                          >
                            {analytics.categoryBreakdown.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any) => [
                              `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                              "Amount",
                            ]}
                            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Daily Spending Area Chart */}
              {analytics.dailySpending.length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Daily Spending Trend (This Month)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.dailySpending} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0F766E" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                          />
                          <Tooltip
                            formatter={(value: any) => [
                              `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                              "Spending",
                            ]}
                            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="amount"
                            stroke="#0F766E"
                            strokeWidth={2}
                            fill="url(#spendGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty state */}
              {analytics.monthlyTrend.every((m) => m.income === 0 && m.expenses === 0) && (
                <Card className="lg:col-span-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground text-center">
                      Start adding transactions to see your analytics here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ===== FAMILY MEMBERS SECTION ===== */}
        {!isLoading && memberAnalytics && memberAnalytics.members.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Family Members
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/settings")}
                className="text-muted-foreground"
              >
                <Settings className="h-4 w-4 me-1" />
                Manage
              </Button>
            </div>

            {/* Member Cards */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {memberAnalytics.members.map((member) => (
                <Card key={member.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 start-0 end-0 h-1 ${
                    member.role === "owner" ? "bg-amber-500" :
                    member.role === "admin" ? "bg-blue-500" : "bg-emerald-500"
                  }`} />
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary">
                              {(member.name || "?")[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {editingMember === member.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-7 text-sm px-2"
                                placeholder="Enter name"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveName(member.id);
                                  if (e.key === "Escape") setEditingMember(null);
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => handleSaveName(member.id)}
                                disabled={savingName}
                              >
                                {savingName ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3 text-green-600" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => setEditingMember(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <p className="text-sm font-semibold truncate">{member.name}</p>
                              <button
                                onClick={() => {
                                  setEditingMember(member.id);
                                  setEditName(member.name || "");
                                }}
                                className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity p-0.5"
                                title="Edit name"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-0.5">
                            {getRoleIcon(member.role)}
                            <span className="text-[10px] text-muted-foreground capitalize">{member.role}</span>
                            {!member.accepted && (
                              <span className="ms-1 px-1.5 py-0.5 rounded text-[9px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                awaiting signup
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Member Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground">Income</p>
                        <p className="text-xs font-bold text-green-600">
                          {member.month.income > 0
                            ? member.month.income >= 1000
                              ? `${(member.month.income / 1000).toFixed(1)}k`
                              : formatAmount(member.month.income)
                            : "0"}
                        </p>
                      </div>
                      <div className="bg-red-50 dark:bg-red-950/30 rounded-lg py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground">Expenses</p>
                        <p className="text-xs font-bold text-red-600">
                          {member.month.expenses > 0
                            ? member.month.expenses >= 1000
                              ? `${(member.month.expenses / 1000).toFixed(1)}k`
                              : formatAmount(member.month.expenses)
                            : "0"}
                        </p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground">Txns</p>
                        <p className="text-xs font-bold text-blue-600">{member.month.transactionCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Comparison Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Member Expenses Comparison Bar Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Member Spending Comparison (This Month)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={memberAnalytics.members.map((m) => ({
                          name: m.name.split(" ")[0],
                          income: m.month.income,
                          expenses: m.month.expenses,
                        }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [
                            `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                            String(name).charAt(0).toUpperCase() + String(name).slice(1),
                          ]}
                          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        />
                        <Legend />
                        <Bar dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} name="Income" />
                        <Bar dataKey="expenses" fill="#dc2626" radius={[4, 4, 0, 0]} name="Expenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Member Share Pie Chart - Expenses */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Who Spent Most? (This Month)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={memberAnalytics.members
                            .filter((m) => m.month.expenses > 0)
                            .map((m) => ({
                              name: m.name.split(" ")[0],
                              value: m.month.expenses,
                            }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }: any) =>
                            `${name} ${((percent || 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {memberAnalytics.members
                            .filter((m) => m.month.expenses > 0)
                            .map((_, index) => (
                              <Cell
                                key={`member-cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [
                            `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                            "Expenses",
                          ]}
                          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Member Share Pie Chart - Income */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Who Earns Most? (This Month)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={memberAnalytics.members
                            .filter((m) => m.month.income > 0)
                            .map((m) => ({
                              name: m.name.split(" ")[0],
                              value: m.month.income,
                            }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }: any) =>
                            `${name} ${((percent || 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {memberAnalytics.members
                            .filter((m) => m.month.income > 0)
                            .map((_, index) => (
                              <Cell
                                key={`income-cell-${index}`}
                                fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]}
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [
                            `PKR ${Number(value || 0).toLocaleString("en-PK")}`,
                            "Income",
                          ]}
                          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Per-Member Category Breakdown */}
              {memberAnalytics.members.filter((m) => m.month.categories.length > 0).length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Category Breakdown Per Member</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {memberAnalytics.members
                        .filter((m) => m.month.categories.length > 0)
                        .map((member) => (
                          <div key={`cat-${member.id}`} className="space-y-2">
                            <p className="text-xs font-semibold flex items-center gap-1">
                              {member.avatar ? (
                                <img src={member.avatar} alt="" className="h-4 w-4 rounded-full" />
                              ) : (
                                <span className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                                  {(member.name || "?")[0].toUpperCase()}
                                </span>
                              )}
                              {member.name.split(" ")[0]}
                            </p>
                            <div className="space-y-1">
                              {member.month.categories.slice(0, 5).map((cat, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="flex-1">
                                    <div className="flex justify-between text-[10px] mb-0.5">
                                      <span className="text-muted-foreground">{cat.name}</span>
                                      <span className="font-medium">PKR {cat.amount.toLocaleString("en-PK")}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${Math.min(100, (cat.amount / member.month.expenses) * 100)}%`,
                                          backgroundColor: cat.color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* All-Time Summary Table */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">All-Time Member Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-start py-2 pe-4 font-medium text-muted-foreground">Member</th>
                          <th className="text-end py-2 px-2 font-medium text-muted-foreground">Total Income</th>
                          <th className="text-end py-2 px-2 font-medium text-muted-foreground">Total Expenses</th>
                          <th className="text-end py-2 px-2 font-medium text-muted-foreground">Balance</th>
                          <th className="text-end py-2 ps-2 font-medium text-muted-foreground">Txns</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberAnalytics.members.map((member) => (
                          <tr key={`row-${member.id}`} className="border-b last:border-0">
                            <td className="py-2 pe-4">
                              <div className="flex items-center gap-2">
                                {member.avatar ? (
                                  <img src={member.avatar} alt="" className="h-6 w-6 rounded-full" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                    {(member.name || "?")[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium truncate max-w-[120px]">{member.name}</span>
                              </div>
                            </td>
                            <td className="text-end py-2 px-2 text-green-600 font-medium">
                              PKR {member.allTime.income.toLocaleString("en-PK")}
                            </td>
                            <td className="text-end py-2 px-2 text-red-600 font-medium">
                              PKR {member.allTime.expenses.toLocaleString("en-PK")}
                            </td>
                            <td className={`text-end py-2 px-2 font-bold ${member.allTime.balance >= 0 ? "text-primary" : "text-red-600"}`}>
                              PKR {member.allTime.balance.toLocaleString("en-PK")}
                            </td>
                            <td className="text-end py-2 ps-2 text-muted-foreground">
                              {member.allTime.transactionCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">{t("dashboard.recentTransactions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <p className="mb-2 text-sm sm:text-base text-muted-foreground">
                  {t("dashboard.noTransactions")}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("dashboard.addFirst")}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => router.push("/transactions/new")}
                >
                  <Plus className="me-2 h-4 w-4" />
                  {t("dashboard.addTransaction")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: tx.color }}
                      >
                        {tx.type === "income" ? "+" : "-"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {language === "ur" ? tx.categoryUr : tx.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.description || tx.date}
                          {tx.source !== "manual" && (
                            <span className="ms-1 text-primary">
                              ({tx.source === "voice" ? "🎤" : tx.source === "auto" ? "🤖" : tx.source === "bill_scan" ? "📷" : ""})
                            </span>
                          )}
                          {tx.addedBy && (
                            <span className="ms-1 text-muted-foreground/70">
                              • by {tx.addedBy.split(" ")[0]}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className={`text-sm font-bold ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>
                      {tx.type === "income" ? "+" : "-"} PKR {formatAmount(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
