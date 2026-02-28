# Panel Test Handling + Instrument Integration Implementation

## Overview

This document describes the implementation of best-practice panel test handling with strict HL7 instrument integration for the LIS system.

## Database Schema Changes

### New Entities

1. **TestComponent** (`test_components`)
   - Normalized panel components table replacing CSV `childTestIds`
   - Fields: `panelTestId`, `childTestId` (composite PK), `required`, `sortOrder`, `reportSection`, `reportGroup`, `effectiveFrom`, `effectiveTo`
   - Supports panel versioning and report grouping

2. **OrderTestResultHistory** (`order_test_result_history`)
   - Tracks all result updates, reruns, and corrections
   - Fields: `orderTestId`, `resultValue`, `resultText`, `unit`, `flag`, `referenceRange`, `receivedAt`, `messageId`, `obxSetId`, `obxSequence`, `instrumentCode`
   - Enables audit trail and duplicate detection

3. **UnmatchedInstrumentResult** (`unmatched_instrument_results`)
   - Inbox for results that cannot be automatically matched
   - Fields: `instrumentId`, `sampleIdentifier`, `instrumentCode`, `resultValue`, `resultText`, `unit`, `flag`, `referenceRange`, `reason`, `status`, `resolvedOrderTestId`
   - Requires manual review and reconciliation

### Updated Entities

1. **OrderTest** (`order_tests`)
   - Added: `parentOrderTestId` (FK to OrderTest.id, nullable)
   - Self-referential: panels have children; children reference parent
   - Supports both parent panel and child analyte OrderTests

## Panel Ordering Logic

### When Ordering a Panel (e.g., CBC):

1. **Create Parent OrderTest** for the panel:
   - `testId` = panel Test.id (CBC)
   - `parentOrderTestId` = null
   - `price` = panel price
   - `status` = PENDING

2. **Expand Components** from `TestComponent` table:
   - Query `TestComponent` where `panelTestId` = panel Test.id
   - Order by `sortOrder`

3. **Create Child OrderTests** for each component:
   - `testId` = child Test.id (WBC, RBC, HGB, etc.)
   - `parentOrderTestId` = parent OrderTest.id
   - `price` = null (parent carries the price)
   - `status` = PENDING

### When Ordering a Single Test:

- Create one OrderTest with `parentOrderTestId` = null

## Panel Status Recomputation

The `PanelStatusService` automatically recomputes parent panel status based on children:

- **IN_PROGRESS**: Some required children missing results
- **COMPLETED**: All required children have results
- **VERIFIED**: All required children verified
- **REJECTED**: Any required child rejected

Called automatically after:
- Any child OrderTest result update
- Any child OrderTest verification/rejection

## HL7 Instrument Integration (Strict Mode)

### Flow

1. **Receive HL7 ORU** via MLLP TCP
2. **Store Raw Message** in `instrument_messages` log
3. **Parse HL7** (MSH, PID, OBR, OBX segments)
4. **Extract Sample Identifier** from OBR-3 (configurable: OBR-2, PID-3)
5. **Find Sample** by identifier (barcode, sampleId, orderNumber)
6. **For Each OBX**:
   - Normalize instrument code (trim, uppercase)
   - Lookup mapping: `instrumentCode` → `Test.id` (child test)
   - **STRICT VALIDATION**: Find existing OrderTest where `sampleId` AND `testId` match
   - If found: Update OrderTest, store history, audit log
   - If NOT found: Store in `UnmatchedInstrumentResult` inbox (DO NOT auto-create)
7. **Recompute Panel Statuses** for affected samples
8. **Return HL7 ACK** (AA/AE/AR)

### Unmatched Reasons

- `UNORDERED_TEST`: Test not ordered for this sample
- `UNMATCHED_SAMPLE`: Sample identifier not found
- `NO_MAPPING`: Instrument code not mapped to LIS test
- `INVALID_SAMPLE_STATUS`: Sample/order in wrong status
- `DUPLICATE_RESULT`: Result already exists (potential duplicate)

### Safety Features

- **Never auto-create OrderTests** from incoming results
- **Always log** unmatched results for review
- **Track history** for reruns/corrections
- **Validate sample status** (exclude cancelled orders)
- **Handle partial results** (panel stays IN_PROGRESS until all required children resulted)

## Configuration Points

### Per-Instrument Settings

- `sampleIdentifierField`: Which HL7 field to use as barcode (default: OBR-3)
- `strictMode`: Strict matching vs lenient (default: true)
- `autoPost`: Automatically post results (default: true)
- `requireVerification`: Require verification before posting (default: false)

### Instrument Test Mapping

- Table: `instrument_test_mappings`
- Maps: `instrumentCode` (e.g., "WBC") → `Test.id` (child test UUID)
- Supports multiplier for unit conversion
- Active/inactive flag

## Frontend: Unmatched Results Page

**Route**: `/unmatched`

**Features**:
- List all unmatched results with filters (status, reason, instrument)
- Statistics dashboard (pending/resolved/discarded counts)
- Detail view for each unmatched result
- Resolve actions:
  - **ATTACH**: Manually attach to an existing OrderTest (requires OrderTest UUID)
  - **DISCARD**: Mark as discarded with notes
- Search by sample ID or instrument code

## Migration Notes

### CBC Panel Migration

The `seedCBCTests()` function now:
1. Creates individual CBC subtests (WBC, RBC, HGB, etc.) as inactive SINGLE tests
2. Creates CBC panel as PANEL test
3. Creates `TestComponent` rows linking panel to subtests
4. Sets `childTestIds` = null (no longer used)

### Existing Orders

- Existing orders with panels will continue to work
- New orders will use the new parent + children structure
- Consider migration script to add parent OrderTests for existing panel orders

## API Endpoints

### Unmatched Results

- `GET /unmatched-results` - List with filters
- `GET /unmatched-results/stats` - Statistics
- `GET /unmatched-results/:id` - Get single result
- `POST /unmatched-results/:id/resolve` - Resolve (attach or discard)

### Panel Status

- `PanelStatusService.recomputePanelStatus(parentOrderTestId)` - Recompute single panel
- `PanelStatusService.recomputePanelsForSample(sampleId)` - Recompute all panels for sample
- `PanelStatusService.recomputeAfterChildUpdate(childOrderTestId)` - Recompute after child update

## Testing Recommendations

1. **Test Panel Ordering**:
   - Order CBC panel → verify parent + 23 children created
   - Check parent has price, children have price = null

2. **Test HL7 Ingestion**:
   - Send ORU with all CBC analytes → verify all matched
   - Send ORU with extra analyte → verify unmatched inbox
   - Send ORU with wrong sample ID → verify unmatched inbox
   - Send duplicate OBX → verify history tracked

3. **Test Panel Status**:
   - Update child results → verify parent status updates
   - Verify all children → verify parent becomes VERIFIED
   - Reject child → verify parent becomes REJECTED

4. **Test Unmatched Resolution**:
   - Attach unmatched to OrderTest → verify result appears
   - Discard unmatched → verify status updated

## Important Notes

- **Data Integrity**: Never silently create OrderTests from instrument results
- **Patient Safety**: Always require manual review for unmatched results
- **Audit Trail**: All result updates are logged in history and audit log
- **Panel Versioning**: `TestComponent.effectiveFrom/effectiveTo` support future panel versioning
- **Report Grouping**: `reportSection` and `reportGroup` enable organized report layouts
