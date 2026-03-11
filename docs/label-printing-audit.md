# Label Printing Audit

## Scope
- Preview label rendering: `frontend/src/components/Print/SampleLabel.tsx`
- Preview CSS layout: `frontend/src/components/Print/print.css`
- Label data shaping: `frontend/src/printing/label-view-model.ts`
- Native Zebra ZPL generation: `frontend/src/printing/zebra-label.ts`
- Print-path dispatch: `frontend/src/printing/direct-print.tsx`
- Gateway printer capability lookup and raw spool: `lis-print-gateway/src/server.ts`
- UI entry points: `frontend/src/pages/OrdersPage.tsx`, `frontend/src/pages/settings/SettingsPrintingPage.tsx`, `frontend/src/pages/settings/SettingsLabelPage.tsx`

## Label Data Flow
1. `OrdersPage` chooses direct print or preview.
2. `direct-print.tsx` fetches printer config and decides between raw ZPL and PDF.
3. `label-view-model.ts` shapes label fields from `order`, `patient`, `sample`, and `orderTests`.
4. `SampleLabel.tsx` renders preview-only SVG barcodes with `JsBarcode`.
5. `zebra-label.ts` generates native ZPL with `^BC` and rasterized graphics only when text cannot be rendered natively.
6. `lis-print-gateway/src/server.ts` sends raw ZPL bytes to the Windows spooler or PDF bytes to `pdf-to-printer`.

## Printed Fields and Fallbacks
| Field | Primary Source | Fallbacks |
| --- | --- | --- |
| `patientName` | `order.patient.fullName` | Empty string |
| `patientGlobalId` | `patientNumber` | `externalId -> nationalId -> patient.id -> "-"` |
| `barcodeValue` | `order.orderNumber` | `sample.barcode -> derived sample id fallback` |
| `barcodeText` | `order.orderNumber` | `barcodeValue` |
| `sexLabel` | `order.patient.sex` | Normalized string -> `"-"` |
| `sequenceLabel` | scope + sequence | Sequence uses `sample.sequenceNumber -> barcode suffix -> index` |
| `testCodes` | top-level sample tests | `test.code -> test.name -> ""` |

## Current Preview vs Zebra Divergence
- Preview uses `JsBarcode` SVG plus CSS millimeter layout.
- Zebra output uses ZPL dot geometry, `^BC` Code 128, and rasterized graphics only for non-ASCII text.
- Preview and ZPL now share the same internal label layout and barcode spec, but preview is still not treated as the exact production renderer.
- Browser preview remains the operator-facing inspection path. Zebra raw ZPL remains the production path for Zebra printers.

## Chosen Direction
- Keep raw ZPL as the default production method for Zebra/ZDesigner printers.
- Keep PDF rendering as fallback for non-Zebra printers and preview workflows.
- Keep barcode symbology as Code 128 for internal lab compatibility.
- Add quiet-zone-aware barcode sizing in ZPL and stop stretching preview SVG width, because horizontal SVG scaling can misrepresent actual barcode width.

## Remaining Physical Validation
- Scanner validation on the actual printer fleet is still required.
- Throughput and spool latency must be confirmed on live hardware for 1, 5, 10, and 20 label batches.
