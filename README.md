# حساب کتاب — HisaabKitaab

<p align="center">
  <a href="https://hisaab-kitaab-five.vercel.app/"><strong>🌐 Live App → hisaab-kitaab-five.vercel.app</strong></a>
</p>

---

**Your pocket-sized financial buddy for Pakistan.**

HisaabKitaab is a bilingual (English + اردو) AI-powered finance app built for everyday Pakistanis — individuals tracking chai-and-paratha expenses, families splitting household bills, or shop owners keeping a digital *bahi khata*.

Talk to it in Urdu, snap a photo of a grocery receipt, or just ask *"Mera paisa kahan gaya?"* — it figures out the rest.

---

## ✨ What It Does

- **Voice Transactions** — Speak naturally in Urdu or English. *"Aaj 500 rupay ki sabzi li"* becomes a logged expense.
- **Bill Scanning** — Point your camera at any receipt, handwritten or printed, Urdu or English. AI extracts every line item.
- **Smart Chat Advisor** — Ask about your spending habits, get budget tips, or request a breakdown — all in conversation.
- **Family Mode** — Invite family members, track who spent what, compare spending with beautiful charts.
- **Dashboard & Analytics** — Monthly trends, category breakdowns, bar charts, pie charts — your money story at a glance.
- **Export** — Download your statements as CSV, JSON, or PDF whenever you need them.

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js · TypeScript · Tailwind CSS · shadcn/ui |
| Auth | Clerk |
| Database | Supabase (PostgreSQL) |
| AI Brain | AWS Bedrock — Claude 3.5 Sonnet |
| Speech | Browser Web Speech API + AWS Transcribe fallback |
| Charts | Recharts |
| PDF | jsPDF |

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/MunibUrRehmanMemon/HisaabKitaab.git
cd HisaabKitaab

# Install
npm install

# Add your environment variables
cp .env.example .env.local
# Fill in: Clerk keys, Supabase URL + keys, AWS credentials

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start tracking.

---

## 🔑 Environment Variables

| Variable | What it's for |
|----------|--------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (frontend) |
| `CLERK_SECRET_KEY` | Clerk auth (server) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── dashboard/       # Main dashboard with analytics
│   ├── settings/        # Profile, family members, preferences
│   └── api/             # All backend routes
│       ├── ensure-profile/
│       ├── dashboard-stats/
│       ├── analytics/
│       ├── member-analytics/
│       ├── members/
│       ├── create-transaction/
│       ├── process-voice-agentic/
│       ├── advisor-agentic/
│       ├── scan-bill/
│       └── export-statement/
├── components/          # Reusable UI components
└── lib/
    ├── supabase/        # Database clients
    ├── aws/             # Bedrock + S3 helpers
    └── account-helpers  # Shared account resolution
```

---

## 🇵🇰 Made For Pakistan

- Currency is always **Rs.** / **روپے** — never dollars
- Dates in **DD/MM/YYYY**
- Full RTL support for Urdu
- AI understands Pakistani spending categories — *chai, kiryana, bijli, mobile load*
- Works on slow connections with graceful fallbacks

---

## 👥 Family Sharing

Invite family members from Settings. Once added:
- Each member's spending is tracked individually
- Dashboard shows comparison charts and "Who Spent Most?" breakdowns
- Category-wise analysis per member
- All powered by a shared family account

---

## 📝 License

MIT

---

<p align="center">
  <em>Paisa aata hai, jaata hai — lekin ab pata chalega kahan gaya.</em>
</p>
