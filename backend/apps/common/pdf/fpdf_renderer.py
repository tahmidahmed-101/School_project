from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT_DIR = Path(__file__).resolve().parent / "fonts"


class DocumentPDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("VantageSans", "", 8)
        self.set_text_color(154, 154, 162)
        page_str = f"Page {self.page_no()} of {{nb}}"
        self.cell(0, 10, page_str, align="R")


def _format_currency(amount: Any, symbol: str = "") -> str:
    if amount is None:
        return "—"
    try:
        val = Decimal(str(amount))
        formatted = f"{val:,.2f}"
        return f"{symbol} {formatted}".strip() if symbol else formatted
    except Exception:
        return str(amount)


def _render_header(pdf: DocumentPDF, context: dict[str, Any], business: dict[str, str]) -> None:
    # --- Header (Business & Title) ---
    pdf.set_font("VantageSans", "B", 18)
    pdf.set_text_color(13, 13, 14)
    doc_title = str(context.get("doc_title") or "INVOICE").upper()
    pdf.cell(100, 8, doc_title, new_x=XPos.RIGHT, new_y=YPos.TOP)

    # Business Name on top right
    biz_name = business.get("name") or business.get("legal_name") or "Store"
    pdf.set_font("VantageSans", "B", 12)
    pdf.cell(85, 8, biz_name, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # Doc number & business contact
    pdf.set_font("VantageSans", "", 10)
    pdf.set_text_color(111, 111, 118)
    doc_number = context.get("doc_number", "")
    pdf.cell(100, 5, f"#{doc_number}" if doc_number else "", new_x=XPos.RIGHT, new_y=YPos.TOP)

    biz_contact = business.get("email") or business.get("phone") or ""
    pdf.cell(85, 5, biz_contact, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    if business.get("address"):
        pdf.cell(
            185, 5, str(business.get("address")), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )

    # Meta dates and status
    doc_meta = context.get("doc_meta") or []
    meta_parts = [f"{m.get('label')}: {m.get('value')}" for m in doc_meta if isinstance(m, dict)]
    if context.get("doc_status"):
        meta_parts.append(f"Status: {str(context.get('doc_status')).upper()}")
    if meta_parts:
        pdf.set_font("VantageSans", "", 9)
        pdf.set_text_color(111, 111, 118)
        pdf.cell(185, 5, "   |   ".join(meta_parts), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(5)
    pdf.set_draw_color(229, 229, 233)
    pdf.line(10, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(6)


def _render_parties(pdf: DocumentPDF, context: dict[str, Any]) -> None:
    # --- Parties (Billed to / Shipped to) ---
    start_y = pdf.get_y()

    # Left column: Billed To
    pdf.set_xy(10, start_y)
    pdf.set_font("VantageSans", "B", 8)
    pdf.set_text_color(154, 154, 162)
    pdf.cell(90, 5, "BILLED TO", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_x(10)
    pdf.set_font("VantageSans", "B", 10)
    pdf.set_text_color(13, 13, 14)
    pdf.cell(90, 5, context.get("customer_name") or "Customer", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("VantageSans", "", 9)
    pdf.set_text_color(111, 111, 118)
    if context.get("customer_email"):
        pdf.set_x(10)
        pdf.cell(90, 4.5, str(context.get("customer_email")), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if context.get("customer_phone"):
        pdf.set_x(10)
        pdf.cell(90, 4.5, str(context.get("customer_phone")), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    billed_bottom = pdf.get_y()

    # Right column: Shipped To
    pdf.set_xy(105, start_y)
    pdf.set_font("VantageSans", "B", 8)
    pdf.set_text_color(154, 154, 162)
    pdf.cell(90, 5, "SHIPPED TO", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_x(105)
    pdf.set_font("VantageSans", "B", 10)
    pdf.set_text_color(13, 13, 14)
    pdf.cell(
        90,
        5,
        context.get("ship_name") or context.get("customer_name") or "—",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.set_font("VantageSans", "", 9)
    pdf.set_text_color(111, 111, 118)
    ship_lines = context.get("ship_lines") or []
    for sline in ship_lines:
        pdf.set_x(105)
        pdf.cell(90, 4.5, str(sline), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    shipped_bottom = pdf.get_y()

    pdf.set_y(max(billed_bottom, shipped_bottom) + 8)


def _render_line_items(pdf: DocumentPDF, context: dict[str, Any], currency: str) -> None:
    # --- Line Items Table ---
    pdf.set_fill_color(250, 248, 244)
    pdf.set_draw_color(229, 229, 233)
    pdf.set_font("VantageSans", "B", 8)
    pdf.set_text_color(111, 111, 118)

    # Column widths: Item (80), SKU (30), Qty (15), Price (25), Total (35) = 185
    pdf.cell(80, 8, "  ITEM", border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(30, 8, "  SKU", border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(15, 8, "QTY", border=1, fill=True, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(25, 8, "PRICE  ", border=1, fill=True, align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(35, 8, "TOTAL  ", border=1, fill=True, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("VantageSans", "", 9)
    pdf.set_text_color(13, 13, 14)

    lines = context.get("lines") or []
    for item in lines:
        name = str(item.get("name") or "Item")
        if item.get("variant_title"):
            name = f"{name} - {item['variant_title']}"
        sku = str(item.get("sku") or "—")
        qty = str(item.get("quantity") or 1)
        price_str = _format_currency(item.get("unit_price"), currency)
        tot_str = _format_currency(item.get("total"), currency)

        if len(name) > 42:
            name = name[:39] + "..."
        if len(sku) > 16:
            sku = sku[:14] + ".."

        pdf.cell(80, 7.5, f"  {name}", border="B", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(30, 7.5, f"  {sku}", border="B", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(15, 7.5, qty, border="B", align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(25, 7.5, f"{price_str}  ", border="B", align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(
            35, 7.5, f"{tot_str}  ", border="B", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )

    if not lines:
        pdf.cell(
            185, 8, "No line items.", border="B", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )

    pdf.ln(6)


def _render_summary_row(
    pdf: DocumentPDF,
    summary_x: float,
    label: str,
    amount: Any,
    currency: str,
    *,
    is_bold: bool = False,
) -> None:
    pdf.set_x(summary_x)
    if is_bold:
        pdf.set_text_color(13, 13, 14)
    else:
        pdf.set_text_color(111, 111, 118)
    pdf.cell(40, 6, label, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(
        40,
        6,
        f"{_format_currency(amount, currency)}  ",
        align="R",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )


def _render_totals(pdf: DocumentPDF, context: dict[str, Any], currency: str) -> None:
    # --- Totals Section ---
    summary_x = 115
    summary_width = 80

    if context.get("subtotal") is not None:
        _render_summary_row(pdf, summary_x, "Subtotal:", context.get("subtotal"), currency)
    if context.get("discount_total") and Decimal(str(context.get("discount_total"))) > 0:
        _render_summary_row(
            pdf, summary_x, "Discount:", f"-{context.get('discount_total')}", currency
        )
    if context.get("tax_total") is not None:
        _render_summary_row(pdf, summary_x, "Tax:", context.get("tax_total"), currency)
    if context.get("shipping_total") is not None:
        _render_summary_row(pdf, summary_x, "Shipping:", context.get("shipping_total"), currency)

    pdf.set_x(summary_x)
    pdf.set_draw_color(20, 20, 26)
    pdf.cell(summary_width, 1, "", border="T", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    _render_summary_row(
        pdf, summary_x, "Grand Total:", context.get("grand_total"), currency, is_bold=True
    )

    if context.get("paid") is not None and Decimal(str(context.get("paid"))) > 0:
        _render_summary_row(pdf, summary_x, "Amount Paid:", context.get("paid"), currency)
    if context.get("balance") is not None:
        _render_summary_row(
            pdf, summary_x, "Balance Due:", context.get("balance"), currency, is_bold=True
        )


def _render_notes(pdf: DocumentPDF, context: dict[str, Any]) -> None:
    if not context.get("notes"):
        return
    pdf.ln(6)
    pdf.set_x(10)
    pdf.set_font("VantageSans", "B", 8)
    pdf.set_text_color(154, 154, 162)
    pdf.cell(185, 4, "NOTES", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(10)
    pdf.set_font("VantageSans", "", 9)
    pdf.set_text_color(111, 111, 118)
    pdf.multi_cell(185, 5, str(context.get("notes")))


def render_fpdf_document(
    context: dict[str, Any], business: dict[str, str] | None = None, currency: str = ""
) -> bytes:
    business = business or {}
    pdf = DocumentPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=20)

    # Register VantageSans fonts
    reg_font = FONT_DIR / "VantageSans-Regular.ttf"
    bold_font = FONT_DIR / "VantageSans-SemiBold.ttf"
    if reg_font.exists():
        pdf.add_font("VantageSans", "", reg_font)
    if bold_font.exists():
        pdf.add_font("VantageSans", "B", bold_font)

    pdf.add_page()

    _render_header(pdf, context, business)
    _render_parties(pdf, context)
    _render_line_items(pdf, context, currency)
    _render_totals(pdf, context, currency)
    _render_notes(pdf, context)

    return bytes(pdf.output())
