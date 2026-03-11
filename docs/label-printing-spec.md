# Label Printing Spec

## Defaults
- Target printers: Zebra/ZDesigner-class label printers first.
- Target DPI: optimize for 203 dpi, remain compatible with 300 dpi.
- Label size: `50 mm x 25 mm`.
- Barcode goal: internal lab scanning reliability, not GS1-first formatting.
- Primary symbology: Code 128.

## Shared Internal Specs
- `LabelLayoutSpec`: shared source of truth for millimeter dimensions, gaps, strip widths, header ratio, and preview CSS variables.
- `BarcodeSpec`: shared source of truth for Code 128 symbology, quiet zone, preview module width, and barcode text policy.
- `PrinterCapabilityProfile`: derived runtime profile for media size, DPI, Zebra detection, raw ZPL preference, and raster-capable text behavior.

## Rendering Ownership
- Preview path: DOM + CSS + `JsBarcode`.
- Zebra path: native ZPL layout + `^BC` barcode.
- Non-ASCII text: native ZPL when possible, raster graphics only when needed.
- Preview is informative, not authoritative. Production fidelity is defined by Zebra output.

## Barcode Rules
- `barcodeValue` uses `order.orderNumber` first.
- If no order number exists, use `sample.barcode`.
- If neither exists, derive a fallback from `sample.id`.
- Human-readable text matches the encoded payload policy unless order number overrides it.
- ZPL barcode width selection must preserve quiet-zone requirements before selecting a wider module width.

## Transport Rules
- Zebra printers: raw ZPL through gateway `/local/print-raw`.
- Non-Zebra printers: PDF through gateway `/local/print`.
- Gateway HTTP routes remain unchanged.

## Instrumentation
- Browser-side print telemetry records generation time, dispatch time, payload size, label count, and effective capability profile.
- Gateway logs now include payload bytes and duration for raw and PDF jobs.

## Benchmark Tooling
- Development builds expose `window.__lisLabelPrintingDevtools__`.
- Available helpers:
- `createSyntheticLabelBenchmarkOrder()`
- `buildLabelPrintingAuditSnapshot()`
- `benchmarkLabelPrintingStrategies()`

## References
- Zebra barcode command groups: `https://docs.zebra.com/us/en/printers/software/zpl-pg/fonts-and-barcodes/bar-code-command-groups.html`
- Zebra stored formats: `https://docs.zebra.com/us/en/printers/software/zpl-pg/advanced-techniques/recall-stored-format-command.html`
- Zebra `^GF` graphics: `https://docs.zebra.com/content/tcm/us/en/printers/software/zpl-pg/zpl-commands/%5Egf.html`
- Zebra printer control: `https://docs.zebra.com/us/en/printers/software/zpl-pg/advanced-techniques/printer-control-commands.html`
- Zebra font guidance: `https://docs.zebra.com/us/en/printers/desktop/zd611r-ug/c-mlk-ug-print-operations-section/r-mlk-ug-printer-fonts.html`
