import json
import sys
import fitz


def color_int_to_hex(color_value):
    if color_value is None:
        return None
    if isinstance(color_value, (list, tuple)) and len(color_value) >= 3:
        r, g, b = [max(0, min(255, int(v))) for v in color_value[:3]]
        return f"#{r:02x}{g:02x}{b:02x}"
    try:
        color_int = int(color_value)
    except Exception:
        return None
    r = (color_int >> 16) & 255
    g = (color_int >> 8) & 255
    b = color_int & 255
    return f"#{r:02x}{g:02x}{b:02x}"


def extract_selection(pdf_path, page_index, rect):
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        pr = page.rect
        target = fitz.Rect(
            pr.x0 + rect["x"] * pr.width,
            pr.y0 + rect["y"] * pr.height,
            pr.x0 + (rect["x"] + rect["width"]) * pr.width,
            pr.y0 + (rect["y"] + rect["height"]) * pr.height,
        )

        words = page.get_text("words")
        words_in_rect = []
        total_rect = None
        for word in words:
            x0, y0, x1, y1, text, *_rest = word
            word_rect = fitz.Rect(x0, y0, x1, y1)
            if not str(text).strip():
                continue

            if not word_rect.intersects(target):
                continue

            intersection = word_rect & target
            overlap_area = max(0, intersection.width) * max(0, intersection.height)
            word_area = max(1e-6, word_rect.width * word_rect.height)
            overlap_ratio = overlap_area / word_area
            center_point = fitz.Point((x0 + x1) / 2, (y0 + y1) / 2)
            center_inside = target.contains(center_point)

            if center_inside or overlap_ratio >= 0.55:
                words_in_rect.append((y0, x0, text, word_rect))
                if total_rect is None:
                    total_rect = fitz.Rect(word_rect)
                else:
                    total_rect.include_rect(word_rect)

        words_in_rect.sort(key=lambda item: (round(item[0], 1), item[1]))
        selected_text = " ".join(text for _y, _x, text, _rect in words_in_rect).strip()

        # Convert total_rect back to relative coordinates with a tiny bit of padding
        # padding helps ensure full coverage of anti-aliased glyph edges
        bbox_result = None
        if total_rect:
            padding_w = pr.width * 0.0004
            padding_h = pr.height * 0.0004
            bbox_result = {
                "x": (total_rect.x0 - padding_w - pr.x0) / pr.width,
                "y": (total_rect.y0 - padding_h - pr.y0) / pr.height,
                "width": (total_rect.width + padding_w * 2) / pr.width,
                "height": (total_rect.height + padding_h * 2) / pr.height
            }

        font_name = None
        font_size = None
        font_color = None

        text_dict = page.get_text("dict")
        matching_spans = []
        for block in text_dict.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    span_bbox = span.get("bbox")
                    if not span_bbox:
                        continue
                    span_rect = fitz.Rect(span_bbox)
                    if span_rect.intersects(target):
                        matching_spans.append(span)

        if matching_spans:
            primary_span = matching_spans[0]
            font_name = primary_span.get("font")
            try:
                font_size = float(primary_span.get("size", 14))
            except Exception:
                font_size = 14.0
            font_color = color_int_to_hex(primary_span.get("color"))

        return {
            "text": selected_text,
            "fontName": font_name,
            "fontSize": font_size,
            "color": font_color,
            "boundingBox": bbox_result
        }
    finally:
        doc.close()


def main():
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Usage: pdf_selection.py <pdf_path> <page_index> <rect_json>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_index = int(sys.argv[2])
    rect = json.loads(sys.argv[3])
    result = extract_selection(pdf_path, page_index, rect)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
