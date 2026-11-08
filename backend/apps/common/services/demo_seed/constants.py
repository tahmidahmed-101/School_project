from __future__ import annotations

from apps.orders.constants import PaymentMethodKey

BRAND = "LaunchCart"

# Every demo row is recognisable by one of these markers, which is what makes
# `seed_demo --fresh` able to wipe its own output without touching real data.
DEMO_DOMAIN = "simpleadmin.demo"
SKU_PREFIX = "IZP"
SLUG_PREFIX = "izp-"
EXPENSE_REF_PREFIX = "IZP-EXP-"
OPENING_REFERENCE_TYPE = "izp_demo_opening"
CARRIER_MARKER = "izp_demo"
DEMO_PASSWORD = "Demo12345!"  # noqa: S105 -- seed-only login for demo accounts, not a secret

TAX_RATE_NAME = "VAT 7.5% (Bangladesh)"
TAX_RATE_PERCENT = "7.50"

# Shipping-zone-related: every live zone gets a demo rate for each demo carrier,
# so checkout can quote any destination. The "Inside Dhaka" / "Outside Dhaka" /
# "Sub Area" zones themselves are fixed logistics fixtures (seeded by a logistics
# migration), not demo data — only the rate values below are ours to create and wipe.

CARRIERS: list[tuple[str, str, str]] = [
    ("Pathao Courier", "pathao", "+8809609111888"),
    ("Steadfast Courier", "steadfast", "+8809610990890"),
    ("RedX Delivery", "redx", "+8809610240240"),
]

# Order: base_weight, base_charge, increment_weight, increment_charge.
SHIPPING_RATE = ("1", "70.00", "1", "40.00")

CATEGORIES: list[tuple[str, str, str]] = [
    ("SHT", "Shirts", "Formal and casual shirting, cut for the Bangladeshi fit."),
    ("PNJ", "Panjabi & Kurta", "Festive and everyday panjabi, kurta and sherwani-cut pieces."),
    ("TRS", "Trousers & Chinos", "Chinos, gabardine and pleated dress trousers."),
    ("DNM", "Denim", "Jeans and denim outerwear in stretch, raw and washed finishes."),
    ("KNT", "Knitwear", "Sweaters, cardigans and pullovers for Khulna's short winter."),
    ("TSP", "T-Shirts & Polos", "Everyday jersey, pique and graphic tees."),
    ("FTW", "Footwear", "Leather formals, boots and canvas sneakers."),
    ("ACC", "Accessories", "Belts, ties, mufflers, wallets and eyewear."),
]

APPAREL_SIZES = ["S", "M", "L", "XL"]
SHOE_SIZES = ["40", "41", "42", "43"]
COLOUR_AXIS = ["Black", "Brown", "Tan", "Navy"]

SIZE_AXES: dict[str, list[str]] = {
    "apparel": APPAREL_SIZES,
    "shoe": SHOE_SIZES,
    "colour": COLOUR_AXIS,
}

# (category code, name, price in BDT, variant axis, unit weight in kg)
PRODUCTS: list[tuple[str, str, str, str, str]] = [
    ("SHT", "Oxford Button-Down Shirt", "2450", "apparel", "0.300"),
    ("SHT", "Slim-Fit Poplin Shirt", "1950", "apparel", "0.280"),
    ("SHT", "Linen Half-Sleeve Shirt", "2650", "apparel", "0.260"),
    ("SHT", "Printed Casual Shirt", "1750", "apparel", "0.290"),
    ("SHT", "Twill Formal Shirt", "2250", "apparel", "0.310"),
    ("PNJ", "Eid Special Cotton Panjabi", "3450", "apparel", "0.420"),
    ("PNJ", "Embroidered Silk Panjabi", "14500", "apparel", "0.480"),
    ("PNJ", "Chikankari Panjabi", "6850", "apparel", "0.400"),
    ("PNJ", "Handloom Khadi Kurta", "2950", "apparel", "0.380"),
    ("PNJ", "Slim-Fit Festive Panjabi", "4650", "apparel", "0.410"),
    ("TRS", "Stretch Chino Trouser", "2350", "apparel", "0.460"),
    ("TRS", "Formal Gabardine Trouser", "2850", "apparel", "0.490"),
    ("TRS", "Cargo Utility Trouser", "2650", "apparel", "0.560"),
    ("TRS", "Cropped Linen Trouser", "2150", "apparel", "0.380"),
    ("TRS", "Pleated Dress Trouser", "3250", "apparel", "0.500"),
    ("DNM", "Slim-Fit Stretch Jeans", "3450", "apparel", "0.620"),
    ("DNM", "Straight-Leg Raw Denim", "4950", "apparel", "0.700"),
    ("DNM", "Distressed Tapered Jeans", "3850", "apparel", "0.640"),
    ("DNM", "Denim Trucker Jacket", "6950", "apparel", "0.850"),
    ("DNM", "Relaxed Wide-Leg Jeans", "3650", "apparel", "0.660"),
    ("KNT", "Merino Crew-Neck Sweater", "5450", "apparel", "0.480"),
    ("KNT", "Cable-Knit Cardigan", "6250", "apparel", "0.560"),
    ("KNT", "Lightweight Cotton Pullover", "2950", "apparel", "0.390"),
    ("KNT", "Zip-Up Knit Hoodie", "3850", "apparel", "0.520"),
    ("KNT", "Shawl-Collar Sweater", "7450", "apparel", "0.610"),
    ("TSP", "Pima Cotton Crew Tee", "1150", "apparel", "0.190"),
    ("TSP", "Pique Polo Shirt", "1650", "apparel", "0.230"),
    ("TSP", "Oversized Graphic Tee", "1350", "apparel", "0.210"),
    ("TSP", "Henley Long-Sleeve Tee", "1850", "apparel", "0.250"),
    ("TSP", "Striped Jersey Polo", "1950", "apparel", "0.240"),
    ("FTW", "Leather Derby Shoe", "6450", "shoe", "0.950"),
    ("FTW", "Suede Chukka Boot", "7250", "shoe", "1.000"),
    ("FTW", "Canvas Court Sneaker", "3450", "shoe", "0.800"),
    ("FTW", "Penny Loafer", "5850", "shoe", "0.880"),
    ("FTW", "Chelsea Boot", "9950", "shoe", "1.100"),
    ("ACC", "Full-Grain Leather Belt", "1850", "colour", "0.220"),
    ("ACC", "Woven Silk Neck Tie", "1250", "colour", "0.090"),
    ("ACC", "Wool Blend Muffler", "1450", "colour", "0.180"),
    ("ACC", "Leather Card Holder", "850", "colour", "0.070"),
    ("ACC", "Polarised Aviator Sunglasses", "3250", "colour", "0.120"),
]

SUPPLIERS: list[tuple[str, str, str, str]] = [
    ("Rupsha Textiles Ltd.", "sourcing.rupsha", "+8801711045620", "Net 30"),
    ("Padma Garments & Weaving", "orders.padma", "+8801819335471", "Net 45"),
    ("Karnaphuli Leather Works", "trade.karnaphuli", "+8801912770043", "Net 30"),
    ("Jamuna Knit Composite", "supply.jamuna", "+8801611904238", "Net 15"),
    ("Surma Accessories House", "hello.surma", "+8801755610092", "Advance"),
]

FIRST_NAMES = [
    "Arif",
    "Tanvir",
    "Nusrat",
    "Sadia",
    "Rakib",
    "Mehedi",
    "Farhana",
    "Imran",
    "Sabbir",
    "Jarin",
    "Naimul",
    "Rezaul",
    "Tahmina",
    "Sabrina",
    "Shahriar",
    "Mahfuz",
    "Rumana",
    "Ashiqur",
    "Nazmul",
    "Sumaiya",
    "Fahim",
    "Tasnim",
    "Rafiul",
    "Anika",
    "Zubair",
    "Mizanur",
    "Sharmin",
    "Adnan",
    "Ishrat",
    "Hasib",
]

LAST_NAMES = [
    "Hossain",
    "Rahman",
    "Islam",
    "Chowdhury",
    "Ahmed",
    "Karim",
    "Sarker",
    "Bhuiyan",
    "Mollah",
    "Talukder",
    "Siddique",
    "Alam",
    "Haque",
    "Mahmud",
    "Uddin",
    "Khandaker",
    "Bepari",
    "Sheikh",
    "Chakraborty",
    "Das",
]

# (district, thana, postcode, street) — checkout stores district in `Address.city`
# and thana in `Address.state`, and the street rides along so it cannot drift.
DELIVERY_AREAS: list[tuple[str, str, str, str]] = [
    ("Dhaka", "Gulshan", "1212", "House 42, Road 11, Banani"),
    ("Khulna", "Sonadanga", "9100", "Sonadanga R/A, Block B, House 7"),
    ("Chattogram", "Panchlaish", "4203", "GEC Circle, Nasirabad, Flat 5C"),
    ("Sylhet", "Zindabazar", "3100", "Zindabazar Main Road, Building 19"),
    ("Rajshahi", "Boalia", "6100", "Shaheb Bazar Boro Masjid Road, House 3"),
    ("Dhaka", "Mirpur", "1216", "Mirpur 10, Block C, Road 4"),
    ("Dhaka", "Dhanmondi", "1209", "Dhanmondi 27, House 44, Flat 2A"),
    ("Chattogram", "Kotwali", "4000", "Jubilee Road, Rahman Plaza, Flat 6B"),
]

DELIVERY_NOTES = [
    "Call before delivery, gate closes after 9pm",
    "Deliver after 6pm, office hours only",
    "Leave with the building caretaker if unavailable",
    "Second gate beside the pharmacy",
    "Lift out of order — please use the stairs",
    "Ring the bell twice, 3rd floor",
]

# Registry keys, not labels — `capture_payment` validates against the registry.
PAYMENT_METHODS = [
    PaymentMethodKey.BKASH,
    PaymentMethodKey.NAGAD,
    PaymentMethodKey.COD,
    PaymentMethodKey.CARD,
]

# (code, name, type) — added on top of the canonical chart of accounts so the
# P&L has real operating-expense lines and the balance sheet has opening equity.
EXTRA_ACCOUNTS: list[tuple[str, str, str]] = [
    ("3000", "Owner's Equity", "equity"),
    ("6100", "Rent Expense", "expense"),
    ("6200", "Utilities Expense", "expense"),
    ("6300", "Marketing Expense", "expense"),
    ("6400", "Office & Admin Expense", "expense"),
]

OPENING_CAPITAL = "8000000.00"

# (account code, payee, monthly amount, description)
MONTHLY_EXPENSES: list[tuple[str, str, str, str]] = [
    ("6100", "Shibbari Properties", "45000.00", "Showroom and warehouse rent"),
    ("6200", "WZPDCL / Titas", "9500.00", "Electricity, gas and water"),
    ("6300", "Bindu Digital", "25000.00", "Facebook and Google campaigns"),
    ("6400", "Khulna Stationers", "7500.00", "Office supplies and printing"),
]

# (code, discount_type, value, min_order_amount, usage_limit, expired) — discount_type and
# the other field names match apps.orders.models.Coupon directly.
DEMO_COUPONS: list[tuple[str, str, str, str, int | None, bool]] = [
    ("EIDSALE25", "percentage", "25.00", "5000.00", 200, False),
    ("IZPWELCOME", "fixed", "500.00", "3000.00", None, False),
    ("WINTER1000", "fixed", "1000.00", "8000.00", 100, False),
    ("BOISHAKH15", "percentage", "15.00", "2000.00", 150, True),
]

DEMO_SALE_CATEGORY = "Knitwear"
DEMO_SALE_PERCENT = "15.00"

DEMO_DISCOUNT_NAMES = (
    "Knitwear Season Offer",
    "Accessories Bundle Saver",
    "Pohela Boishakh Storewide",
)

# A few guest sign-ups for the newsletter block — (local part, still subscribed).
NEWSLETTER_SIGNUPS: list[tuple[str, bool]] = [
    ("priyo.deals", True),
    ("eid.updates", True),
    ("style.updates", True),
    ("winter.collection", True),
    ("vip.customer", True),
    ("wishlist.alerts", False),
    ("old.subscriber", False),
    ("newsletter.test", True),
]

# TEST-NET-3 (RFC 5737) — reserved for documentation, never a real visitor's
# address, so these rows are unmistakably demo data.
DEMO_BLOCKED_IPS: list[tuple[str, str]] = [
    ("203.0.113.42", "Checkout automation detected — repeated failed OTP attempts."),
    ("203.0.113.77", "Known VPN exit node used for card-testing attempts."),
]

# (phone, reason, strength) — PhoneBlock.Strength values.
DEMO_BLOCKED_PHONES: list[tuple[str, str, str]] = [
    ("01799000011", "Refused COD delivery three times in one month.", "blocked"),
    ("01799000022", "High return rate on COD orders.", "advance_only"),
]

AUDIT_MARKER = "izp_demo"
AUDIT_IPS = ["203.0.113.50", "203.0.113.51", "203.0.113.52"]
AUDIT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "Mobile Safari/604.1",
]

# ---- storefront and dashboard extras (extras.py) ----------------------------

# Email local part, first name, last name and role.
DEMO_TEAM: list[tuple[str, str, str, str]] = [
    ("admin", "Demo", "Admin", "admin"),
    ("staff", "Demo", "Staff", "staff"),
]

# Fake wallet numbers, only filled in where staff have not set a real one.
DEMO_PAY_TO: dict[str, str] = {
    PaymentMethodKey.BKASH: "01700000001",
    PaymentMethodKey.NAGAD: "01800000002",
}
DEMO_STOREFRONT_METHODS = [PaymentMethodKey.COD, PaymentMethodKey.BKASH, PaymentMethodKey.NAGAD]

HERO_ALT_PREFIX = "Demo slide"
# Placement, background colour, tag (en, bn), title (en, bn), link.
HERO_SLIDES: list[tuple[str, tuple[int, int, int], str, str, str, str, str]] = [
    (
        "home",
        (38, 70, 83),
        "New arrivals",
        "নতুন এসেছে",
        "Fresh stock, ready to ship",
        "নতুন স্টক, এখনই পাঠানো যাবে",
        "/shop",
    ),
    (
        "home",
        (120, 80, 50),
        "Offers",
        "অফার",
        "Collect a voucher before you order",
        "অর্ডারের আগে ভাউচার নিয়ে নিন",
        "/shop",
    ),
]
# Placement, then the line in English and Bangla.
PROMO_LINES: list[tuple[str, str, str]] = [
    (
        "home",
        "Demo store: cash on delivery, bKash and Nagad accepted",
        "ডেমো স্টোর: ক্যাশ অন ডেলিভারি, বিকাশ আর নগদে পেমেন্ট করা যায়",
    ),
]

DEMO_BRANDS: list[tuple[str, str]] = [
    ("Izara", "House label for shirting and panjabi."),
    ("Padma Loom", "Knit and jersey basics."),
    ("Northline", "Denim and trousers."),
]

BUNDLE_SKU = f"{SKU_PREFIX}-BND-01"
BUNDLE_NAME = "Everyday Starter Pack"

REVIEW_COMMENTS: list[tuple[int, str]] = [
    (5, "Good fabric and the size was right. Delivery took two days."),
    (4, "Nice product. The colour is a little darker than the photo."),
    (5, "Second time ordering, same quality as before."),
    (3, "Okay for the price. Packaging could be better."),
    (4, "Fits well. Courier called before coming."),
]
QUESTIONS: list[tuple[str, str]] = [
    (
        "Is cash on delivery available outside Dhaka?",
        "Yes, cash on delivery works everywhere we deliver.",
    ),
    ("Does the colour fade after washing?", "No fading in normal wash. Avoid bleach."),
    ("Can I exchange if the size does not fit?", "Yes, see the return policy page for the steps."),
    ("How long does delivery take to Chattogram?", ""),
    ("Is this the same as the one in the photo?", ""),
]
PRICE_REPORT_COMMENTS = [
    "Saw this cheaper at another shop last week.",
    "Price here is higher than on your Facebook page.",
    "Sale price is not showing in my cart.",
    "Listed price changed after I added it.",
]
DEMO_FRAUD_CASE_PREFIX = "IZP-CASE-"
EXPENSE_CATEGORY_NOTE = "Demo expense category"
