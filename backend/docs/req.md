## 1. Critical Blockers

- Shipping Zones and Rates Unconfigured: Guest checkout fails with no_shipping_zone (or no_shipping_rate). Address match logic relies on city/district keywords. Needs at least a catch-all zone or "Dhaka" vs outside-Dhaka zones with weight-based rates.
- Business Profile Placeholder Data: GET /business-profile/ returns demo contact details (+1 555 000-0000, admin@example.com). Real phone, WhatsApp, email, address, and social links need to be configured.

## 2. OpenAPI Specification Issues

- Tracking Path Mismatch: YAML specifies POST /tracking/track/, but real route is POST /tracking/orders/track/.
- Missing Fields: Variants return compare_at_price, which is omitted in the YAML spec.
- Error Response Structure: YAML specifies string values, but backend returns arrays with nested list wrapping (e.g., shipping_address: [{postal_code: [...]}]).
- Search Behavior: ?search= matches variant SKU in addition to name (spec indicates name only).
- Undocumented Responses: Several 400/404 response bodies are omitted, including bundle-detail 404 code variant_not_found.
- Inconsistent Error Format: Tracking 400 error body lacks a fields key unlike standard error objects.
- Missing Customer API Spec: The entire /api/v1/customer/ suite (auth, profile, addresses, orders, wishlist, reviews, cart, returns) is missing from the public spec.

## 3. Missing Storefront Functionality

- Payment Method Selection: POST /checkout/ lacks a payment method parameter (COD, bKash). Orders remain stuck in awaiting_payment.
- Shipping Quote Endpoint: No public endpoint exists to fetch shipping costs, zones, or carriers prior to checkout.
- Coupon Validation: Missing endpoint to validate coupons. Checkout ignores invalid/expired coupons without informing the customer.
- Stock Quantities: Only an in_stock boolean is provided, preventing display of remaining inventory counts.
- Category Metadata: Public payload lacks category image, description, and product counts.
- Product Listing Description: Product list endpoint omits descriptions required for feeds and search cards.
- Localization / Translations: No support for Bengali localization; content defaults entirely to English.
- Product Identification: Missing dedicated fields for product code and brand; product_type is an internal enum.

## 4. Data Requirements

- Pricing & Inventory: Update placeholder prices and default stock count (50 units/variant) with real inventory data.
- Media & CDN Storage: Migrate product image assets from local storefront paths to backend media storage or a CDN.
- Variant Weights: Configure weight attributes across all variants to support weight-calculated shipping rates.

## 5. Security & Behavioral Audits

- Guest Account Collisions: Guest checkout attaches orders to existing customer accounts based solely on email. Requires email verification or guest segregation.
- Checkout Idempotency: Lack of idempotency keys on checkout allows network retries to produce duplicate orders.
- Rate Limiting & Throttling: Guest checkout lacks a dedicated throttle. Verify rate limits in non-local environments.
- Order Tracking Protection: Add throttling to tracking lookups to defend order numbers against brute-force queries.
- Failed Order Cleanup: Aborted checkout flows leave orphan guest user records and addresses in the database.

## 6. Production Configuration Checklists

- CORS & CSRF Headers: Set CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS to production storefront domain.
- Media Storage: Configure HTTPS media delivery with a persistent MEDIA_ROOT.
- Environment Variables: Configure production values for SECRET_KEY, Postgres DATABASE_URL, ALLOWED_HOSTS, and Redis instance.
- Admin Credentials: Update default admin credentials (admin@example.com) prior to deployment.

Summary Note: Items in Section 1 (Critical Blockers) and items 10–12 in Section 3 represent the highest priority gaps preventing proper end-to-end storefront integration.
