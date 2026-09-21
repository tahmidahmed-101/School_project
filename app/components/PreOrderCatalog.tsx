"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ShieldCheck, Clock, Truck, ChevronDown } from "lucide-react";
import { PREORDER_PRODUCTS } from "../lib/preorder-data";
import { ProductCard } from "./ProductCard";
import { Breadcrumbs } from "./Breadcrumbs";
import { CardReveal } from "./Reveal";
import { useLang } from "../lib/i18n";

type CategoryFilter = "all" | "gadgets";
type StatusFilter = "all" | "available" | "closing-soon";

const FAQ_ITEMS = [
  {
    id: "how-it-works",
    question: {
      en: "1. How does pre-ordering work?",
      bn: "১. প্রি-অর্ডার প্রক্রিয়া কীভাবে কাজ করে?",
    },
    answer: {
      en: "Pre-ordering lets you reserve an upcoming product before regular stock arrives. We will contact you by phone or WhatsApp to confirm your order before dispatch.",
      bn: "প্রি-অর্ডারে আপনি রেগুলার স্টক আসার আগেই আসন্ন পণ্য রিজার্ভ করে রাখতে পারেন। পাঠানোর আগে ফোন বা হোয়াটসঅ্যাপে যোগাযোগ করে আপনার অর্ডার নিশ্চিত করা হবে।",
    },
  },
  {
    id: "when-to-pay",
    question: {
      en: "2. When do I pay for my pre-order?",
      bn: "২. প্রি-অর্ডারের পেমেন্ট কখন করতে হবে?",
    },
    answer: {
      en: "You can pay by cash on delivery or bKash. The store will confirm the payment details when it contacts you about your order.",
      bn: "আপনি ক্যাশ অন ডেলিভারি বা বিকাশে পেমেন্ট করতে পারবেন। অর্ডারের বিষয়ে যোগাযোগের সময় দোকান পেমেন্টের বিস্তারিত জানিয়ে দেবে।",
    },
  },
  {
    id: "can-i-cancel",
    question: {
      en: "3. Can I cancel my reservation?",
      bn: "৩. আমি কি প্রি-অর্ডার বাতিল করতে পারব?",
    },
    answer: {
      en: "If you want to change or cancel a pre-order, please contact us on WhatsApp or by phone as early as you can, before your order is dispatched.",
      bn: "প্রি-অর্ডার পরিবর্তন বা বাতিল করতে চাইলে অর্ডার পাঠানোর আগেই যত তাড়াতাড়ি সম্ভব হোয়াটসঅ্যাপ বা ফোনে আমাদের জানান।",
    },
  },
  {
    id: "delay-notice",
    question: {
      en: "4. What if the stock arrival is delayed?",
      bn: "৪. পণ্য পৌঁছাতে কোনো বিলম্ব হলে কী হবে?",
    },
    answer: {
      en: "If the stock arrives later than expected, we will let you know by phone or WhatsApp.",
      bn: "স্টক আসতে দেরি হলে আমরা ফোন বা হোয়াটসঅ্যাপে আপনাকে জানিয়ে দেব।",
    },
  },
];

const isGadget = (category: string) => category === "gadgets";

export function PreOrderCatalog() {
  const { t, ui, n } = useLang();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openFaqId, setOpenFaqId] = useState<string | null>("how-it-works");

  const categories: { id: CategoryFilter; label: { en: string; bn: string } }[] = [
    { id: "all", label: { en: "All Pre-orders", bn: "সব প্রি-অর্ডার" } },
    { id: "gadgets", label: { en: "Gadgets", bn: "গ্যাজেটস" } },
  ];

  const filteredProducts = useMemo(() => {
    return PREORDER_PRODUCTS.filter((product) => {
      // Category filter
      if (activeCategory === "gadgets" && !isGadget(product.category)) return false;

      // Status filter
      if (statusFilter === "available" && product.preorderStatus === "sold-out") {
        return false;
      }
      if (statusFilter === "closing-soon" && product.preorderStatus !== "closing-soon") {
        return false;
      }

      return true;
    });
  }, [activeCategory, statusFilter]);

  const countsByCategory = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: PREORDER_PRODUCTS.length,
      gadgets: PREORDER_PRODUCTS.filter((p) => isGadget(p.category)).length,
    };
    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-white py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <Breadcrumbs
            items={[
              { label: ui("navPreOrder") },
            ]}
          />
        </div>

        {/* Page Header */}
        <div className="mb-8 rounded-3xl border border-gold-200/80 bg-gradient-to-br from-gold-50/80 via-white to-gold-50/40 p-6 sm:p-10 shadow-sm">
          <div className="max-w-2xl">
            <h1 className="ts-display text-2xl font-extrabold tracking-tight text-gold-600 sm:text-4xl">
              {ui("preOrderHeaderTitle")}
            </h1>

            {/* Quick Guarantees row */}
            <div className="mt-6 grid grid-cols-2 gap-3 pt-2 text-[11px] font-semibold text-ink-700 sm:grid-cols-4">
              <div className="flex items-center gap-2 rounded-xl bg-white/80 p-2.5 border border-ink-200/60 shadow-2xs">
                <Truck className="h-4 w-4 shrink-0 text-gold-600" />
                <span>Reserve Early</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/80 p-2.5 border border-ink-200/60 shadow-2xs">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold-600" />
                <span>Order Confirmation</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/80 p-2.5 border border-ink-200/60 shadow-2xs">
                <Clock className="h-4 w-4 shrink-0 text-gold-600" />
                <span>Delivery Updates</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/80 p-2.5 border border-ink-200/60 shadow-2xs">
                <Calendar className="h-4 w-4 shrink-0 text-gold-600" />
                <span>Nationwide Delivery</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="mb-8 flex flex-col gap-4 border-b border-ink-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0 sm:pb-0">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              const count = countsByCategory[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-brand-700 text-white shadow-md"
                      : "border border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-950"
                  }`}
                >
                  <span>{t(cat.label)}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                      isActive ? "bg-gold-400 text-ink-950" : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {n(count)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status filter toggle */}
          <div className="flex shrink-0 items-center gap-2 text-xs self-end sm:self-auto">
            <span className="text-ink-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 focus:border-gold-500 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="available">Available now</option>
              <option value="closing-soon">Closing soon</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="rounded-3xl border border-ink-200 bg-ink-50/60 p-12 text-center">
            <p className="text-sm font-bold text-ink-800">No pre-order products match this filter.</p>
            <p className="mt-1 text-xs text-ink-500">Try selecting a different category or status.</p>
            <button
              type="button"
              onClick={() => {
                setActiveCategory("all");
                setStatusFilter("all");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-5 py-2 text-xs font-bold text-ink-950 transition-colors hover:bg-gold-400"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {filteredProducts.map((product, idx) => (
              <CardReveal key={product.id} delay={(idx % 4) * 0.07}>
                <ProductCard product={product} />
              </CardReveal>
            ))}
          </div>
        )}

        {/* Pre-order Policy & FAQ Section */}
        <div className="mt-16 rounded-3xl border border-ink-200 bg-ink-50/70 p-6 sm:p-10">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-ink-900 sm:text-xl">
              Frequently Asked Questions About Pre-ordering
            </h3>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openFaqId === item.id;
              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                    isOpen
                      ? "border-gold-400/80 bg-white shadow-xs ring-2 ring-gold-500/10"
                      : "border-ink-200/80 bg-white hover:border-ink-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    className="flex w-full cursor-pointer items-center justify-between p-4 text-left sm:p-5"
                    aria-expanded={isOpen}
                  >
                    <span className="text-xs font-bold text-ink-900 sm:text-sm">
                      {t(item.question)}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-ink-500 transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-gold-600" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-ink-100 px-4 pb-4 pt-3 text-xs leading-relaxed text-ink-600 sm:px-5 sm:pb-5 sm:text-sm">
                          {t(item.answer)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
