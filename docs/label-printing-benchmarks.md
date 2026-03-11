# Label Printing Benchmarks

## How to Run
1. Start the frontend in development mode.
2. Open the app in a browser.
3. Run `window.__lisLabelPrintingDevtools__.benchmarkLabelPrintingStrategies()` in DevTools.
4. Copy the generated Markdown table from the returned `markdownTable` field.
5. For live dispatch timing, print real labels and inspect `window.__LIS_LABEL_PRINT_METRICS__`.

## Benchmark Table Template
| Batch | Strategy | Generation | Payload | Notes |
| ---: | --- | ---: | ---: | --- |
| 1 | zpl_native | pending live capture | pending live capture | raw ZPL, native text |
| 1 | zpl_raster | pending live capture | pending live capture | raw ZPL with Arabic text forcing raster graphics |
| 1 | pdf_preview | pending live capture | pending live capture | html2canvas + jsPDF |
| 5 | zpl_native | pending live capture | pending live capture | raw ZPL, native text |
| 5 | zpl_raster | pending live capture | pending live capture | raw ZPL with Arabic text forcing raster graphics |
| 5 | pdf_preview | pending live capture | pending live capture | html2canvas + jsPDF |
| 10 | zpl_native | pending live capture | pending live capture | raw ZPL, native text |
| 10 | zpl_raster | pending live capture | pending live capture | raw ZPL with Arabic text forcing raster graphics |
| 10 | pdf_preview | pending live capture | pending live capture | html2canvas + jsPDF |
| 20 | zpl_native | pending live capture | pending live capture | raw ZPL, native text |
| 20 | zpl_raster | pending live capture | pending live capture | raw ZPL with Arabic text forcing raster graphics |
| 20 | pdf_preview | pending live capture | pending live capture | html2canvas + jsPDF |

## Live Printer Validation Checklist
- Scan each printed batch with the target barcode readers.
- Confirm barcode readability near the quiet zones.
- Confirm long patient names and long test lists do not overlap the barcode zone.
- Compare 203 dpi and 300 dpi devices if both exist in the fleet.
- Compare browser preview against physical output only for operator expectations, not for production authority.
