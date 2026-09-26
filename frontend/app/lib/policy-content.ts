import type { T } from "./types";

interface PolicySection {
  heading: T;
  body: T;
}

export interface PolicyContent {
  title: T;
  updated: T;
  intro: T;
  sections: PolicySection[];
}

export const RETURN_POLICY: PolicyContent = {
  title: { en: "Return Policy", bn: "রিটার্ন নীতি" },
  updated: { en: "Last updated: September 2026", bn: "সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬" },
  intro: {
    en: "We want you to be happy with every order. If something isn't right, you can return it under the terms below.",
    bn: "আমরা চাই আপনার প্রতিটি অর্ডার নিয়ে আপনি সন্তুষ্ট থাকুন। কোনো সমস্যা হলে নিচের শর্তানুযায়ী পণ্য ফেরত দিতে পারবেন।",
  },
  sections: [
    {
      heading: { en: "Return window", bn: "রিটার্নের সময়সীমা" },
      body: {
        en: "You can request a return within 3 days of receiving your order. Items must be unused, unwashed, and in their original packaging with tags attached.",
        bn: "পণ্য হাতে পাওয়ার ৩ দিনের মধ্যে রিটার্নের অনুরোধ করতে পারবেন। পণ্য অবশ্যই অব্যবহৃত, অধোয়া এবং ট্যাগসহ মূল প্যাকেজিংয়ে থাকতে হবে।",
      },
    },
    {
      heading: { en: "Eligible items", bn: "যেসব পণ্য রিটার্নযোগ্য" },
      body: {
        en: "Most items are eligible for return if they arrive damaged, defective, or different from what you ordered (wrong size, colour, or product).",
        bn: "পণ্য ক্ষতিগ্রস্ত, ত্রুটিপূর্ণ অথবা অর্ডারকৃত পণ্যের চেয়ে ভিন্ন (ভুল সাইজ, রং বা প্রোডাক্ট) হলে বেশিরভাগ পণ্য রিটার্নযোগ্য।",
      },
    },
    {
      heading: { en: "Non-returnable items", bn: "যেসব পণ্য রিটার্নযোগ্য নয়" },
      body: {
        en: "Innerwear, earrings, and other personal-care or hygiene items cannot be returned once opened, unless they arrived damaged or defective. Pre-order items are confirmed at the time of booking and are not eligible for change of mind returns.",
        bn: "ইনারওয়্যার, দুল এবং অন্যান্য পার্সোনাল-কেয়ার বা হাইজিন পণ্য একবার খোলা হলে ফেরত নেওয়া হয় না, তবে সেগুলো ক্ষতিগ্রস্ত বা ত্রুটিপূর্ণ অবস্থায় পৌঁছালে ভিন্ন কথা। প্রি-অর্ডার পণ্য বুকিংয়ের সময় নিশ্চিত করা হয়, তাই মত পরিবর্তনের কারণে তা রিটার্ন করা যায় না।",
      },
    },
    {
      heading: { en: "How to start a return", bn: "যেভাবে রিটার্নের অনুরোধ করবেন" },
      body: {
        en: "Message us on WhatsApp or call our hotline with your order number and photos of the item. We'll confirm the pickup or drop-off details and guide you through the next steps.",
        bn: "আপনার অর্ডার নম্বর ও পণ্যের ছবিসহ হোয়াটসঅ্যাপে মেসেজ করুন অথবা আমাদের হটলাইনে কল করুন। আমরা পিকআপ বা ড্রপ-অফের বিস্তারিত নিশ্চিত করে পরবর্তী ধাপে সহায়তা করব।",
      },
    },
    {
      heading: { en: "Return shipping", bn: "রিটার্ন শিপিং" },
      body: {
        en: "If the return is due to our error (wrong or damaged item), we cover the return shipping cost. For change-of-mind returns, the customer covers the courier charge both ways.",
        bn: "আমাদের ভুলে (ভুল বা ক্ষতিগ্রস্ত পণ্য) রিটার্ন হলে রিটার্ন শিপিং খরচ আমরা বহন করি। মত পরিবর্তনের কারণে রিটার্ন করলে উভয় দিকের কুরিয়ার খরচ গ্রাহককে বহন করতে হবে।",
      },
    },
  ],
};

export const REFUND_POLICY: PolicyContent = {
  title: { en: "Refund Policy", bn: "রিফান্ড নীতি" },
  updated: { en: "Last updated: September 2026", bn: "সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬" },
  intro: {
    en: "Once your return is received and inspected, here's how and when your refund is processed.",
    bn: "আপনার রিটার্ন পণ্য হাতে পাওয়া ও পরীক্ষার পর রিফান্ড কীভাবে ও কখন প্রক্রিয়া করা হয় তা নিচে দেওয়া হলো।",
  },
  sections: [
    {
      heading: { en: "Inspection", bn: "পরীক্ষা" },
      body: {
        en: "After we receive your returned item, our team inspects it within 2 business days to confirm it meets the return conditions.",
        bn: "রিটার্ন পণ্য হাতে পাওয়ার পর আমাদের টিম ২ কর্মদিবসের মধ্যে তা রিটার্নের শর্ত পূরণ করছে কিনা তা পরীক্ষা করে দেখে।",
      },
    },
    {
      heading: { en: "Refund method", bn: "রিফান্ডের মাধ্যম" },
      body: {
        en: "Cash-on-delivery orders are refunded via bKash, Nagad, or bank transfer to the account you provide. Orders paid online are refunded to the original payment method.",
        bn: "ক্যাশ অন ডেলিভারি অর্ডারের রিফান্ড বিকাশ, নগদ বা আপনার দেওয়া ব্যাংক হিসাবে করা হয়। অনলাইনে পরিশোধিত অর্ডারের রিফান্ড মূল পেমেন্ট মাধ্যমেই ফেরত দেওয়া হয়।",
      },
    },
    {
      heading: { en: "Refund timeline", bn: "রিফান্ডের সময়" },
      body: {
        en: "Once approved, refunds are issued within 3-7 business days. Mobile financial service transfers are usually faster than bank transfers.",
        bn: "অনুমোদনের পর রিফান্ড ৩-৭ কর্মদিবসের মধ্যে দেওয়া হয়। ব্যাংক ট্রান্সফারের তুলনায় মোবাইল ফাইন্যান্সিয়াল সার্ভিসে ট্রান্সফার সাধারণত দ্রুত হয়।",
      },
    },
    {
      heading: { en: "Partial refunds", bn: "আংশিক রিফান্ড" },
      body: {
        en: "If only part of your order is returned, or an item shows signs of use beyond inspection, we may issue a partial refund and let you know the reason beforehand.",
        bn: "অর্ডারের কিছু অংশ রিটার্ন হলে বা পণ্যে ব্যবহারের চিহ্ন পাওয়া গেলে আমরা আংশিক রিফান্ড দিতে পারি এবং আগে থেকেই কারণ জানিয়ে দেব।",
      },
    },
    {
      heading: { en: "Delivery charges", bn: "ডেলিভারি চার্জ" },
      body: {
        en: "Original delivery charges are refunded only when the return is due to our error. For change-of-mind returns, delivery charges are non-refundable.",
        bn: "আমাদের ভুলে রিটার্ন হলে মূল ডেলিভারি চার্জ ফেরত দেওয়া হয়। মত পরিবর্তনের কারণে রিটার্ন করলে ডেলিভারি চার্জ ফেরতযোগ্য নয়।",
      },
    },
    {
      heading: { en: "Need help?", bn: "সাহায্য দরকার?" },
      body: {
        en: "If it's been longer than 7 business days since your refund was approved, message us on WhatsApp or call our hotline and we'll look into it right away.",
        bn: "রিফান্ড অনুমোদনের ৭ কর্মদিবসের বেশি সময় পার হয়ে গেলে হোয়াটসঅ্যাপে মেসেজ করুন অথবা আমাদের হটলাইনে কল করুন, আমরা সাথে সাথেই খতিয়ে দেখব।",
      },
    },
  ],
};
