"""
Generate a Hebrew safety certificate PDF for OCR testing.
Uses fpdf2 with a bundled Unicode font so Hebrew text renders correctly.
"""
from fpdf import FPDF
from pathlib import Path
import urllib.request, os

OUT = Path(__file__).parent / "test_certificate_hebrew.pdf"

# Download a free Hebrew-supporting TTF font (Noto Sans Hebrew) if not cached
FONT_PATH = Path(__file__).parent / "NotoSansHebrew.ttf"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf"

if not FONT_PATH.exists():
    print("Downloading NotoSansHebrew font...")
    urllib.request.urlretrieve(FONT_URL, FONT_PATH)
    print("Font downloaded.")

pdf = FPDF(orientation="P", unit="mm", format="A4")
pdf.add_page()
pdf.add_font("Hebrew", style="", fname=str(FONT_PATH))
pdf.add_font("Hebrew", style="B", fname=str(FONT_PATH))

def rtl(text):
    """Reverse text for basic RTL rendering in fpdf2."""
    return text[::-1]

def hline(y):
    pdf.set_draw_color(180, 180, 180)
    pdf.line(20, y, 190, y)

# Header box
pdf.set_fill_color(30, 80, 160)
pdf.rect(0, 0, 210, 35, "F")
pdf.set_font("Hebrew", "B", 20)
pdf.set_text_color(255, 255, 255)
pdf.set_xy(0, 8)
pdf.cell(210, 10, rtl("תעודת בטיחות מקצועית"), align="C")
pdf.set_font("Hebrew", "", 12)
pdf.set_xy(0, 20)
pdf.cell(210, 10, rtl("רשות העבודה הישראלית - אגף הבטיחות בעבודה"), align="C")

pdf.set_text_color(0, 0, 0)

# Cert number
pdf.set_font("Hebrew", "", 10)
pdf.set_xy(150, 38)
pdf.cell(50, 6, "CERT-2024-7823 :מספר תעודה", align="R")

hline(46)

# Body title
pdf.set_font("Hebrew", "B", 15)
pdf.set_xy(20, 50)
pdf.cell(170, 10, rtl("תעודת מפעיל מנוף וציוד הרמה"), align="C")

pdf.set_font("Hebrew", "", 11)
pdf.set_xy(20, 62)
pdf.cell(170, 8, rtl("מאשרים בזאת כי:"), align="C")

# Holder info box
pdf.set_fill_color(245, 248, 255)
pdf.rect(30, 72, 150, 40, "F")
pdf.set_draw_color(100, 140, 200)
pdf.rect(30, 72, 150, 40)

pdf.set_font("Hebrew", "B", 13)
pdf.set_xy(30, 75)
pdf.cell(150, 8, rtl("ישראל ישראלי"), align="C")

pdf.set_font("Hebrew", "", 11)
pdf.set_xy(30, 85)
pdf.cell(150, 7, rtl("123456789 :מספר זהות"), align="C")
pdf.set_xy(30, 93)
pdf.cell(150, 7, rtl("מהנדס בטיחות בכיר :תפקיד"), align="C")

pdf.set_font("Hebrew", "", 11)
pdf.set_xy(20, 118)
pdf.multi_cell(170, 7,
    rtl("עמד בכל הדרישות לתפעול בטוח של ציוד הרמה"),
    align="C")
pdf.set_xy(20, 126)
pdf.multi_cell(170, 7,
    rtl("בהתאם לתקנות הבטיחות בעבודה (ציוד הרמה) התשע\"ד-2014"),
    align="C")

hline(138)

# Dates table
pdf.set_font("Hebrew", "B", 11)
pdf.set_xy(30, 142)
pdf.cell(70, 8, rtl("15/03/2024 :תאריך הנפקה"), align="R")
pdf.set_xy(110, 142)
pdf.cell(70, 8, rtl("15/03/2027 :תוקף עד"), align="R")

# Cert type
pdf.set_font("Hebrew", "", 11)
pdf.set_xy(30, 153)
pdf.cell(150, 8, rtl("בטיחות - הרמה :סוג התעודה"), align="C")

hline(164)

# Issuer
pdf.set_font("Hebrew", "B", 11)
pdf.set_xy(20, 168)
pdf.cell(170, 8, rtl("רשות העבודה הישראלית :גוף מנפיק"), align="C")

pdf.set_font("Hebrew", "", 10)
pdf.set_xy(20, 178)
pdf.cell(170, 7, rtl("משרד העבודה, הרווחה והשירותים החברתיים"), align="C")

# Signatures
hline(192)
pdf.set_font("Hebrew", "", 10)
pdf.set_xy(30, 196)
pdf.cell(60, 7, rtl("מנהל אגף הבטיחות"), align="C")
pdf.set_xy(120, 196)
pdf.cell(60, 7, rtl("חתימת המורשה"), align="C")

pdf.set_xy(30, 203)
pdf.cell(60, 7, "_________________", align="C")
pdf.set_xy(120, 203)
pdf.cell(60, 7, "_________________", align="C")

# Footer
pdf.set_fill_color(240, 240, 240)
pdf.rect(0, 272, 210, 25, "F")
pdf.set_font("Hebrew", "", 9)
pdf.set_text_color(100, 100, 100)
pdf.set_xy(0, 277)
pdf.cell(210, 6, rtl("תעודה זו הונפקה בהתאם לחוק ארגון פיקוח על העבודה, תשי\"ד-1954"), align="C")
pdf.set_xy(0, 284)
pdf.cell(210, 6, rtl("לבירורים: 1-800-354-354  |  www.gov.il/safety"), align="C")

pdf.output(str(OUT))
print(f"Created: {OUT}")
