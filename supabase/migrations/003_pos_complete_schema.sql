-- ============================================================
-- Migration 003: Complete POS & Inventory Management Schema
-- Depends on: 001_initial_schema.sql, 002_auth_multitenant.sql
-- Run in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- HELPER: Reusable updated_at trigger (skip if already exists)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Macro to attach the trigger to any table
CREATE OR REPLACE FUNCTION public.create_updated_at_trigger(p_table TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I;
     CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
    p_table
  );
END;
$$;

-- ============================================================
-- 1. STORES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  code            TEXT,                                     -- short store code
  address         TEXT,
  city            TEXT,
  country         TEXT        NOT NULL DEFAULT 'Ghana',
  phone           TEXT,
  email           TEXT,
  currency        TEXT        NOT NULL DEFAULT 'GHS',
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Standard audit columns
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, code)
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_select" ON public.stores FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "stores_insert" ON public.stores FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "stores_update" ON public.stores FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "stores_delete" ON public.stores FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('stores');

CREATE INDEX IF NOT EXISTS idx_stores_business_id   ON public.stores(business_id);
CREATE INDEX IF NOT EXISTS idx_stores_deleted_at     ON public.stores(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 2. ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,   -- system roles cannot be deleted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, name)
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select" ON public.roles FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "roles_insert" ON public.roles FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "roles_update" ON public.roles FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "roles_delete" ON public.roles FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('roles');

CREATE INDEX IF NOT EXISTS idx_roles_business_id ON public.roles(business_id);

-- ============================================================
-- 3. PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL UNIQUE,    -- e.g. 'sales.create'
  display_name    TEXT        NOT NULL,
  description     TEXT,
  module          TEXT        NOT NULL,            -- sales | inventory | reports | settings | admin
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

-- Permissions are global (not per-business); no RLS needed.
CREATE INDEX IF NOT EXISTS idx_permissions_module ON public.permissions(module);

-- ── Role ↔ Permission junction ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id         UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id   UUID        NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── User ↔ Role junction ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id         UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  store_id        UUID        REFERENCES public.stores(id) ON DELETE CASCADE,  -- null = all stores
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id  ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id  ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_store_id ON public.user_roles(store_id);

-- ============================================================
-- 4. CATEGORIES  (hierarchical — parent/child)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  parent_id       UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  description     TEXT,
  image_url       TEXT,
  sort_order      INT         NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, slug)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('categories');

CREATE INDEX IF NOT EXISTS idx_categories_business_id ON public.categories(business_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id   ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_deleted_at  ON public.categories(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 5. BRANDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brands (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  website         TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, slug)
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_select" ON public.brands FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "brands_insert" ON public.brands FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "brands_update" ON public.brands FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "brands_delete" ON public.brands FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('brands');

CREATE INDEX IF NOT EXISTS idx_brands_business_id ON public.brands(business_id);
CREATE INDEX IF NOT EXISTS idx_brands_deleted_at  ON public.brands(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 6. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id           UUID          REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id              UUID          REFERENCES public.brands(id) ON DELETE SET NULL,
  name                  TEXT          NOT NULL,
  slug                  TEXT          NOT NULL,
  description           TEXT,
  sku                   TEXT          NOT NULL,          -- Stock Keeping Unit
  barcode               TEXT,
  unit                  TEXT          NOT NULL DEFAULT 'piece',  -- piece, kg, litre, box, etc.
  cost_price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  is_trackable          BOOLEAN       NOT NULL DEFAULT TRUE,  -- track inventory stock?
  allow_negative_stock  BOOLEAN       NOT NULL DEFAULT FALSE,
  low_stock_threshold   INT           NOT NULL DEFAULT 10,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  created_by            UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('products');

CREATE INDEX IF NOT EXISTS idx_products_business_id  ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id  ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id     ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku          ON public.products(business_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode      ON public.products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at   ON public.products(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_name_search  ON public.products USING gin(to_tsvector('english', name));

-- ============================================================
-- 7. PRODUCT IMAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_images (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  alt_text        TEXT,
  sort_order      INT         NOT NULL DEFAULT 0,
  is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_images_select" ON public.product_images FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "product_images_insert" ON public.product_images FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "product_images_update" ON public.product_images FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "product_images_delete" ON public.product_images FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('product_images');

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_primary    ON public.product_images(product_id, is_primary);

-- ============================================================
-- 8. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  email               TEXT,
  phone               TEXT,
  address             TEXT,
  city                TEXT,
  country             TEXT          NOT NULL DEFAULT 'Ghana',
  tax_id              TEXT,
  credit_limit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  loyalty_points      INT           NOT NULL DEFAULT 0,
  notes               TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  created_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('customers');

CREATE INDEX IF NOT EXISTS idx_customers_business_id ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone       ON public.customers(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_email       ON public.customers(business_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at  ON public.customers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_name_search ON public.customers USING gin(to_tsvector('english', name));

-- ============================================================
-- 9. SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  email               TEXT,
  phone               TEXT,
  address             TEXT,
  city                TEXT,
  country             TEXT          NOT NULL DEFAULT 'Ghana',
  tax_id              TEXT,
  contact_person      TEXT,
  payment_terms       TEXT,                   -- e.g. 'Net 30', 'COD'
  outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  created_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('suppliers');

CREATE INDEX IF NOT EXISTS idx_suppliers_business_id ON public.suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at  ON public.suppliers(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 10. PURCHASES  (Purchase Orders from Suppliers)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.purchases_seq START 1;

CREATE TABLE IF NOT EXISTS public.purchases (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id        UUID          NOT NULL REFERENCES public.stores(id),
  supplier_id     UUID          REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_no    TEXT          NOT NULL,   -- PO-2026-000001  (see trigger below)
  status          TEXT          NOT NULL DEFAULT 'Draft',
    -- Draft | Ordered | Partial | Received | Cancelled
  order_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  received_date   DATE,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount      NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, reference_no)
);

-- Auto-generate reference number
CREATE OR REPLACE FUNCTION public.set_purchase_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference_no IS NULL OR NEW.reference_no = '' THEN
    NEW.reference_no := 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.purchases_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchases_reference ON public.purchases;
CREATE TRIGGER trg_purchases_reference
  BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_reference();

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_select" ON public.purchases FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "purchases_insert" ON public.purchases FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "purchases_update" ON public.purchases FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "purchases_delete" ON public.purchases FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('purchases');

CREATE INDEX IF NOT EXISTS idx_purchases_business_id  ON public.purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_store_id     ON public.purchases(store_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id  ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status       ON public.purchases(business_id, status);
CREATE INDEX IF NOT EXISTS idx_purchases_order_date   ON public.purchases(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_deleted_at   ON public.purchases(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 11. PURCHASE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  purchase_id       UUID          NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id        UUID          NOT NULL REFERENCES public.products(id),
  quantity          NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12,2) NOT NULL,
  tax_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(12,2) NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by        UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items_select" ON public.purchase_items FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "purchase_items_insert" ON public.purchase_items FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "purchase_items_update" ON public.purchase_items FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "purchase_items_delete" ON public.purchase_items FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('purchase_items');

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id  ON public.purchase_items(product_id);

-- ============================================================
-- 12. SALES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.sales_seq START 1;

CREATE TABLE IF NOT EXISTS public.sales (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id        UUID          NOT NULL REFERENCES public.stores(id),
  customer_id     UUID          REFERENCES public.customers(id) ON DELETE SET NULL,
  cashier_id      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  reference_no    TEXT          NOT NULL,   -- INV-2026-000001
  status          TEXT          NOT NULL DEFAULT 'Completed',
    -- Draft | Completed | Cancelled | Refunded | Partial
  sale_date       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount      NUMERIC(12,2) GENERATED ALWAYS AS (GREATEST(total_amount - paid_amount, 0)) STORED,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, reference_no)
);

CREATE OR REPLACE FUNCTION public.set_sale_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference_no IS NULL OR NEW.reference_no = '' THEN
    NEW.reference_no := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.sales_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_reference ON public.sales;
CREATE TRIGGER trg_sales_reference
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_reference();

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON public.sales FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "sales_insert" ON public.sales FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "sales_update" ON public.sales FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "sales_delete" ON public.sales FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('sales');

CREATE INDEX IF NOT EXISTS idx_sales_business_id   ON public.sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id      ON public.sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id   ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id    ON public.sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_status        ON public.sales(business_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date     ON public.sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at    ON public.sales(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 13. SALE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id         UUID          NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id      UUID          NOT NULL REFERENCES public.products(id),
  quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL,
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "sale_items_update" ON public.sale_items FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "sale_items_delete" ON public.sale_items FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('sale_items');

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id    ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- ============================================================
-- 14. INVENTORY  (current stock level per product per store)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id            UUID          NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id          UUID          NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_on_hand    NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_reserved   NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_available  NUMERIC(12,3) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_counted_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  created_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (store_id, product_id)
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_select" ON public.inventory FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "inventory_insert" ON public.inventory FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "inventory_update" ON public.inventory FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "inventory_delete" ON public.inventory FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('inventory');

CREATE INDEX IF NOT EXISTS idx_inventory_business_id  ON public.inventory(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_store_id     ON public.inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id   ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock    ON public.inventory(business_id, quantity_on_hand);

-- ============================================================
-- 15. INVENTORY MOVEMENTS  (full history of every stock change)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id        UUID          NOT NULL REFERENCES public.stores(id),
  product_id      UUID          NOT NULL REFERENCES public.products(id),
  movement_type   TEXT          NOT NULL,
    -- purchase_in | sale_out | adjustment_in | adjustment_out
    -- transfer_in | transfer_out | return_in | return_out | damage | opening
  reference_type  TEXT,         -- sale | purchase | adjustment | transfer
  reference_id    UUID,         -- ID of the originating record
  quantity        NUMERIC(12,3) NOT NULL,  -- positive=in, negative=out
  quantity_before NUMERIC(12,3) NOT NULL,
  quantity_after  NUMERIC(12,3) NOT NULL,
  unit_cost       NUMERIC(12,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_select" ON public.inventory_movements FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "inventory_movements_insert" ON public.inventory_movements FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "inventory_movements_update" ON public.inventory_movements FOR UPDATE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('inventory_movements');

CREATE INDEX IF NOT EXISTS idx_inv_mov_business_id    ON public.inventory_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_store_id       ON public.inventory_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_product_id     ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_type           ON public.inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_reference      ON public.inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created_at     ON public.inventory_movements(created_at DESC);

-- ============================================================
-- 16. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id        UUID          REFERENCES public.stores(id) ON DELETE SET NULL,
  reference_type  TEXT          NOT NULL,  -- sale | purchase | expense
  reference_id    UUID          NOT NULL,
  payment_method  TEXT          NOT NULL,
    -- cash | card | mobile_money | bank_transfer | cheque | credit
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency        TEXT          NOT NULL DEFAULT 'GHS',
  exchange_rate   NUMERIC(10,6) NOT NULL DEFAULT 1,
  transaction_ref TEXT,         -- mobile money ref, card auth code, etc.
  payment_date    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  status          TEXT          NOT NULL DEFAULT 'Completed',
    -- Pending | Completed | Failed | Reversed
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "payments_update" ON public.payments FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "payments_delete" ON public.payments FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('payments');

CREATE INDEX IF NOT EXISTS idx_payments_business_id   ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference     ON public.payments(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_method        ON public.payments(business_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_status        ON public.payments(business_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_date          ON public.payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at    ON public.payments(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 17. EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id          UUID          REFERENCES public.stores(id) ON DELETE SET NULL,
  category          TEXT          NOT NULL,
    -- utilities | rent | salaries | maintenance | supplies | marketing | transport | other
  description       TEXT          NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency          TEXT          NOT NULL DEFAULT 'GHS',
  expense_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method    TEXT,
  receipt_url       TEXT,
  is_recurring      BOOLEAN       NOT NULL DEFAULT FALSE,
  recurrence_period TEXT,         -- monthly | weekly | yearly
  status            TEXT          NOT NULL DEFAULT 'Paid',
    -- Draft | Pending | Approved | Paid | Rejected
  approved_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by        UUID          REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('expenses');

CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON public.expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_id    ON public.expenses(store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON public.expenses(business_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at  ON public.expenses(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 18. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES public.users(id) ON DELETE CASCADE,  -- NULL = broadcast
  type            TEXT        NOT NULL,
    -- low_stock | payment_due | sale_complete | purchase_received | system | alert
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  action_url      TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- Users can only read their own notifications or broadcast notifications
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (
    business_id = public.current_business_id() AND
    (user_id = auth.uid() OR user_id IS NULL)
  );
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  business_id = public.current_business_id() AND
  (user_id = auth.uid() OR user_id IS NULL)
);
SELECT public.create_updated_at_trigger('notifications');

CREATE INDEX IF NOT EXISTS idx_notifications_business_id ON public.notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread      ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type        ON public.notifications(business_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON public.notifications(created_at DESC);

-- ============================================================
-- 19. SETTINGS  (key-value store per business or per store)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id        UUID        REFERENCES public.stores(id) ON DELETE CASCADE,  -- NULL = business-wide
  key             TEXT        NOT NULL,
  value           JSONB       NOT NULL DEFAULT 'null',
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (business_id, store_id, key)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON public.settings FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "settings_insert" ON public.settings FOR INSERT WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "settings_update" ON public.settings FOR UPDATE USING (business_id = public.current_business_id());
CREATE POLICY "settings_delete" ON public.settings FOR DELETE USING (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('settings');

CREATE INDEX IF NOT EXISTS idx_settings_business_id ON public.settings(business_id);
CREATE INDEX IF NOT EXISTS idx_settings_store_id    ON public.settings(store_id);
CREATE INDEX IF NOT EXISTS idx_settings_key         ON public.settings(business_id, key);

-- ============================================================
-- 20. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,      -- CREATE | UPDATE | DELETE | LOGIN | LOGOUT | VIEW
  entity_type     TEXT        NOT NULL,      -- products | sales | users | inventory ...
  entity_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT WITH CHECK (business_id = public.current_business_id());
SELECT public.create_updated_at_trigger('audit_logs');

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id  ON public.audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id      ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity       ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action       ON public.audit_logs(business_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON public.audit_logs(created_at DESC);

-- ============================================================
-- SEED: Core permissions
-- ============================================================
INSERT INTO public.permissions (name, display_name, module, description) VALUES
  -- Sales
  ('sales.view',       'View Sales',       'sales',     'View sales transactions'),
  ('sales.create',     'Create Sales',     'sales',     'Create new sales'),
  ('sales.edit',       'Edit Sales',       'sales',     'Edit existing sales'),
  ('sales.delete',     'Delete Sales',     'sales',     'Delete or void sales'),
  ('sales.refund',     'Process Refunds',  'sales',     'Issue refunds on sales'),
  -- Purchases
  ('purchases.view',   'View Purchases',   'purchases', 'View purchase orders'),
  ('purchases.create', 'Create Purchases', 'purchases', 'Create purchase orders'),
  ('purchases.edit',   'Edit Purchases',   'purchases', 'Edit purchase orders'),
  ('purchases.delete', 'Delete Purchases', 'purchases', 'Delete purchase orders'),
  ('purchases.receive','Receive Stock',    'purchases', 'Mark purchases as received'),
  -- Inventory
  ('inventory.view',   'View Inventory',   'inventory', 'View stock levels'),
  ('inventory.adjust', 'Adjust Inventory', 'inventory', 'Make stock adjustments'),
  ('inventory.transfer','Transfer Stock',  'inventory', 'Transfer stock between stores'),
  -- Products
  ('products.view',    'View Products',    'products',  'View product catalog'),
  ('products.create',  'Create Products',  'products',  'Add new products'),
  ('products.edit',    'Edit Products',    'products',  'Edit product details'),
  ('products.delete',  'Delete Products',  'products',  'Remove products'),
  -- Customers
  ('customers.view',   'View Customers',   'customers', 'View customer records'),
  ('customers.create', 'Create Customers', 'customers', 'Add new customers'),
  ('customers.edit',   'Edit Customers',   'customers', 'Edit customer details'),
  ('customers.delete', 'Delete Customers', 'customers', 'Remove customers'),
  -- Suppliers
  ('suppliers.view',   'View Suppliers',   'suppliers', 'View supplier records'),
  ('suppliers.create', 'Create Suppliers', 'suppliers', 'Add new suppliers'),
  ('suppliers.edit',   'Edit Suppliers',   'suppliers', 'Edit supplier details'),
  -- Reports
  ('reports.view',     'View Reports',     'reports',   'Access reports'),
  ('reports.export',   'Export Reports',   'reports',   'Export reports to CSV/PDF'),
  -- Expenses
  ('expenses.view',    'View Expenses',    'expenses',  'View expense records'),
  ('expenses.create',  'Create Expenses',  'expenses',  'Add new expenses'),
  ('expenses.approve', 'Approve Expenses', 'expenses',  'Approve expense requests'),
  -- Admin
  ('admin.users',      'Manage Users',     'admin',     'Create and manage user accounts'),
  ('admin.roles',      'Manage Roles',     'admin',     'Create and manage roles'),
  ('admin.settings',   'Manage Settings',  'admin',     'Configure business settings'),
  ('admin.stores',     'Manage Stores',    'admin',     'Create and manage stores')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- CLEAN UP helper function (no longer needed externally)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_updated_at_trigger(TEXT);
