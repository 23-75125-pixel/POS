# PH-POS · Philippines Multi-Store Point of Sale System

A complete, production-ready POS web app for 4 stores built with **HTML + Vanilla JS + Bootstrap 5 + Supabase**.

---

## 🚀 Quick Setup

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Choose a region close to Philippines (e.g., Singapore)
3. Note your **Project URL** and **Anon/Public Key** from **Settings → API**

---

### Step 2: Run the SQL Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Open `supabase_schema.sql` from this project
3. Run the entire script — it will:
   - Create all 14 tables with proper indexes
   - Set up Row Level Security (RLS) policies
   - Create helper functions (VAT, TXN numbering)
  - Seed 4 stores (Branch 1-4) only

4. Add your own categories and products manually in the app:
  - Go to `products.html`
  - Create categories and products based on your real inventory
  - No dummy/sample product data is inserted by schema

---

### Step 3: Create the First Admin User

1. In Supabase dashboard → **Authentication → Users**
2. Click **Add user** (email/password), not **Invite user**
3. Create user with email: `admin@phpos.ph`
4. Set password to: `password123`
5. Then go to **SQL Editor** and run:

```sql
-- Set the admin role (replace with actual user ID from auth.users)
UPDATE profiles SET role = 'admin', full_name = 'System Admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@phpos.ph');

-- Give admin access to all stores (optional - admin sees all by default)
```

6. Alternatively, create users directly in SQL:

```sql
-- After creating user via Supabase Auth dashboard, update their profile:
UPDATE profiles 
SET role = 'manager', full_name = 'Store Manager'
WHERE id = (SELECT id FROM auth.users WHERE email = 'manager@phpos.ph');

-- Assign store access for non-admin users:
INSERT INTO user_store_access (user_id, store_id)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'manager@phpos.ph'),
  id
FROM stores WHERE code IN ('STR1', 'STR2');
```

---

### Step 4: Configure the App

Open `config.js` and replace the placeholder values:

```javascript
window.POS_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5...'
};
```

---

### Step 5: Run Locally

Use any static file server:

```bash
# Option A: Python
python3 -m http.server 8080

# Option B: Node.js live-server
npx live-server --port=8080

# Option C: VS Code
# Install "Live Server" extension, right-click index.html → Open with Live Server
```

Open: [http://localhost:8080/login.html](http://localhost:8080/login.html)

---

### Step 6: Deploy (Optional)

Deploy to **Netlify**, **Vercel**, or **GitHub Pages** — just upload the entire folder as a static site. No server required.

---

### Step 7: Enable In-App User Invite/Create (Required for Users page)

The app's `users.html` now uses a secure Supabase Edge Function for creating users.

1. Install and login to Supabase CLI:

```bash
npm i -g supabase
supabase login
```

2. Link your project (run inside this repo):

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

3. Deploy the function:

```bash
supabase functions deploy invite-user
```

4. Set required function secrets:

```bash
supabase secrets set \
  SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  SUPABASE_ANON_KEY=YOUR_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

5. Ensure your logged-in account has `role = 'admin'` in `profiles` table.

Without this function deployment, clicking **Create User** in `users.html` will fail with auth/admin permission errors.

---

## 📁 Project Structure

```
ph-pos/
├── config.js                  ← Supabase credentials (edit this)
├── supabase_schema.sql        ← Full DB schema + RLS + branch seed
├── login.html                 ← Login page
├── dashboard.html             ← Admin/Manager dashboard
├── pos.html                   ← Main POS screen (cashier)
├── products.html              ← Product CRUD
├── inventory.html             ← Stock management
├── sales.html                 ← Sales history
├── returns.html               ← Returns & refunds
├── reports.html               ← Analytics & reports
├── users.html                 ← User management (admin)
├── settings.html              ← Store settings (admin)
└── src/
    ├── css/
    │   └── main.css           ← Global dark theme styles
    └── js/
        ├── supabaseClient.js  ← Supabase client singleton
        ├── auth.js            ← Authentication + session
        ├── rbac.js            ← Role-based access control
        ├── utils.js           ← Formatters, toast, helpers
        ├── pos.js             ← POS sessions + sales logic
        ├── products.js        ← Products + stock CRUD
        ├── reports.js         ← Reporting queries
        └── receipts.js        ← 80mm thermal receipt HTML
```

---

## 👥 Default User Roles

| Role     | Access |
|----------|--------|
| Admin    | Everything across all 4 stores |
| Staff    | Products + Inventory + Sales History for assigned stores |
| Cashier  | POS only — open session, sell, print receipt |

---

## 🏪 4 Default Stores

| Code | Store |
|------|-------|
| STR1 | Branch 1 |
| STR2 | Branch 2 |
| STR3 | Branch 3 |
| STR4 | Branch 4 |

---

## 💳 Supported Payment Methods

- 💵 Cash (with change computation)
- 📱 GCash
- 🔵 Maya
- 💳 Card / Credit
- 🔀 Split Payment (multiple methods per transaction)

---

## 🧾 PH VAT Handling

- Default: **VAT-inclusive** pricing (12%)
- VAT computation: `total / 1.12 × 0.12`
- VATable sales: `total / 1.12`
- Senior/PWD discount: 20% on VAT-exclusive amount
- Full VAT breakdown on every receipt

---

## 🔒 Security Notes

- All data access controlled via **Supabase RLS**
- Only the **anon key** is used in the frontend — never the service role key
- Cashiers can only see their own store's data
- Admins have cross-store visibility
- All sensitive actions are logged to `audit_logs`

---

## 📊 Reports Available

- Daily/weekly/monthly sales summary
- Top products by revenue
- Sales by category (with chart)
- Payment method breakdown
- Gross profit & margin
- Inventory valuation (cost vs retail)
- Export to CSV

---

## 🧾 Receipt Format

80mm thermal-compatible receipt includes:
- Store name, address, TIN
- OR/TXN number, date/time, cashier name
- Itemized list with qty × price
- Subtotal, discount, VAT breakdown
- Total, payment method, change
- Receipt footer message

---

## 🛠 Troubleshooting

**"relation does not exist" error** → Run the full `supabase_schema.sql` in Supabase SQL Editor

**Login redirects back to login** → Check that the `profiles` table has a row for your user with the correct role

**"permission denied" RLS error** → Make sure your user has an entry in `user_store_access` for the store, or has role = 'admin'

**Products not showing in POS** → Ensure the product is active, has stock in the selected store, and has a linked `store_products` row (new products are auto-linked to all stores by trigger)

---

## 📞 CSV Import Format for Products

```csv
sku,barcode,name,category,unit,cost,price,vat_inclusive,stock,reorder_level
PROD001,4800000001,Product Name,Food & Beverages,pcs,10.00,25.00,true,100,10
```
