export type AccountMode = "individual" | "family" | "shop";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export type TransactionType = "income" | "expense";

export type TransactionSource = "manual" | "bill_scan" | "voice" | "auto";

export interface Profile {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  preferred_language: "en" | "ur";
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  name_ur?: string;
  mode: AccountMode;
  owner_id: string;
  monthly_budget: number;
  shop_name?: string;
  shop_type?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountMember {
  id: string;
  account_id: string;
  profile_id: string;
  role: MemberRole;
  invited_email?: string;
  accepted: boolean;
  spending_limit?: number;
  joined_at: string;
  profile?: Profile;
}

export interface Category {
  id: string;
  account_id?: string;
  name_en: string;
  name_ur: string;
  icon?: string;
  color?: string;
  type: "income" | "expense" | "both";
  is_default: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  account_id: string;
  added_by?: string;
  type: TransactionType;
  amount: number;
  category_id?: string;
  description_en?: string;
  description_ur?: string;
  notes?: string;
  source: TransactionSource;
  receipt_image_url?: string;
  payment_method: string;
  transaction_date: string;
  created_at: string;
  metadata?: Record<string, any>;
  category?: Category;
  added_by_profile?: Profile;
}

export interface Budget {
  id: string;
  account_id: string;
  category_id?: string;
  amount: number;
  period: "weekly" | "monthly" | "yearly";
  created_at: string;
  category?: Category;
}

export interface SavingsGoal {
  id: string;
  account_id: string;
  title_en: string;
  title_ur?: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  is_completed: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  account_id: string;
  profile_id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  language: "en" | "ur";
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AIReport {
  id: string;
  account_id: string;
  report_type: "weekly" | "monthly" | "anomaly" | "forecast";
  content_en?: string;
  content_ur?: string;
  data?: Record<string, any>;
  period_start?: string;
  period_end?: string;
  created_at: string;
}

// Shop Mode Types
export interface InventoryItem {
  id: string;
  account_id: string;
  name_en: string;
  name_ur?: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unit: string;
  buy_price: number;
  sell_price: number;
  reorder_level: number;
  image_url?: string;
  is_active: boolean;
  last_restocked?: string;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  account_id: string;
  transaction_id?: string;
  customer_name?: string;
  is_credit: boolean;
  created_at: string;
  transaction?: Transaction;
  sale_items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  inventory_item_id?: string;
  quantity: number;
  unit_price: number;
  total: number;
  inventory_item?: InventoryItem;
}

export interface Purchase {
  id: string;
  account_id: string;
  transaction_id?: string;
  supplier_name?: string;
  receipt_image_url?: string;
  created_at: string;
  transaction?: Transaction;
  purchase_items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  inventory_item_id?: string;
  quantity: number;
  unit_price: number;
  total: number;
  inventory_item?: InventoryItem;
}

export interface CreditEntry {
  id: string;
  account_id: string;
  customer_name: string;
  customer_phone?: string;
  amount: number;
  type: "credit_given" | "payment_received";
  description?: string;
  sale_id?: string;
  created_at: string;
  sale?: Sale;
}

// Dashboard types
export interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  balance: number;
  transactionCount: number;
  topCategory?: {
    name: string;
    amount: number;
  };
}

// AI Response types
export interface BillScanResult {
  vendor_name?: string;
  vendor_type?: string;
  total_amount: number;
  items: Array<{
    name_en: string;
    name_ur?: string;
    quantity?: number;
    price: number;
    category?: string;
  }>;
  confidence: number;
  warnings?: string[];
  suggested_category?: string;
  metadata?: Record<string, any>;
}

export interface VoiceEntryResult {
  transactions: Array<{
    type: TransactionType;
    amount: number;
    item_en: string;
    item_ur?: string;
    category?: string;
    quantity?: number;
    payment_method?: string;
    confidence: number;
  }>;
  clarification_needed?: string;
}

export interface ForecastResult {
  dates: string[];
  predicted_values: number[];
  confidence_lower: number[];
  confidence_upper: number[];
  insights: string[];
  cash_crunch_dates?: string[];
}

export interface InsightCard {
  type: "warning" | "success" | "info" | "tip";
  title_en: string;
  title_ur: string;
  message_en: string;
  message_ur: string;
  action?: {
    label_en: string;
    label_ur: string;
    href: string;
  };
}
