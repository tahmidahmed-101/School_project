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

DEMO_COUPONS: list[dict] = [
    {
        "code": "EIDSALE25",
        "description": "Eid collection — 25% off, capped at ৳3,000.",
        "coupon_type": "percentage",
        "value": "25.00",
        "minimum_order_amount": "5000.00",
        "maximum_discount_amount": "3000.00",
        "expired": False,
    },
    {
        "code": "IZPWELCOME",
        "description": "৳500 off a customer's first order over ৳3,000.",
        "coupon_type": "fixed_amount",
        "value": "500.00",
        "minimum_order_amount": "3000.00",
        "maximum_discount_amount": None,
        "expired": False,
    },
    {
        "code": "WINTER1000",
        "description": "৳1,000 off knitwear-season baskets over ৳8,000.",
        "coupon_type": "fixed_amount",
        "value": "1000.00",
        "minimum_order_amount": "8000.00",
        "maximum_discount_amount": None,
        "expired": False,
    },
    {
        "code": "BOISHAKH15",
        "description": "Pohela Boishakh 15% off — campaign closed.",
        "coupon_type": "percentage",
        "value": "15.00",
        "minimum_order_amount": "2000.00",
        "maximum_discount_amount": "2000.00",
        "expired": True,
    },
    {
        "code": "FRIENDS300",
        "description": "৳300 referral credit — campaign closed.",
        "coupon_type": "fixed_amount",
        "value": "300.00",
        "minimum_order_amount": "1500.00",
        "maximum_discount_amount": None,
        "expired": True,
    },
]

DEMO_DISCOUNT_NAMES = (
    "Knitwear Season Offer",
    "Accessories Bundle Saver",
    "Pohela Boishakh Storewide",
)
