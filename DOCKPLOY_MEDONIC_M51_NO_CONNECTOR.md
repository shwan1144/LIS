# Dockploy Runbook: Medonic M51 HL7 Integration (No Connector)

This runbook configures Medonic M51 to send HL7 ORU results directly to LIS backend TCP listener.

Scope:
- Protocol: HL7
- Transport: TCP
- Mode: Results only
- Runtime: Dockploy backend Docker service

## 1) Port planning

Reserve one TCP port per analyzer.

Example:
- Medonic M51: `5600`
- Future analyzers: `5601`, `5602`, ...

## 2) Dockploy backend service settings

In backend service:

1. Keep normal HTTP publish for app/API (existing port mapping for `3000`).
2. Add analyzer TCP publish:
   - Host port: `5600`
   - Container port: `5600`
   - Protocol: `TCP`
3. Redeploy backend.

Note:
- Dockerfile now exposes both `3000` and `5600`.
- For extra analyzers, add extra TCP mappings in Dockploy for each instrument port.

## 3) LIS instrument configuration

Open `Settings -> Instruments` and create/edit Medonic entry:

- `Code`: `MED_M51`
- `Name`: `Medonic M51`
- `Protocol`: `HL7_V2`
- `Connection Type`: `TCP_SERVER`
- `Port`: `5600`
- `Bidirectional Enabled`: `false`
- `Is Active`: `true`

Keep lab policy values for:
- `Auto Post`
- `Require Verification`

## 4) Medonic M51 communication settings

Set on analyzer side:

- Destination host/IP: backend host IP reachable from analyzer LAN/VPN
- Destination port: `5600`
- Message type: `HL7 ORU`
- Framing: `MLLP` (`VT ... FS CR`)

Required field mapping:
- Order number: `OBR-3`
- Test code: `OBX-3.1`
- Result value: `OBX-5`
- Unit (optional): `OBX-6`
- Flag (optional): `OBX-8`
- Result status: `OBX-11` (prefer `F`)

Important:
- LIS currently resolves strictly by order number and expects it in `OBR-3`.

## 5) LIS test-code mappings

For each Medonic code, create mapping in LIS:

- `instrumentTestCode` = analyzer code from `OBX-3.1`
- `testId` = LIS test
- `multiplier` = optional only if conversion is needed

## 6) Validation

1. Create a LIS order containing mapped tests.
2. Send ORU from Medonic for that order number.
3. Verify:
   - Instrument message status is `PROCESSED`.
   - No unmatched errors.
   - Result appears under the expected order tests.

Recommended acceptance:
- 10/10 messages process without unmatched.
- No `Order number not found` errors.
- No `No mapping for test code` errors.
- Reconnect after analyzer restart still works.

## 7) Troubleshooting quick checks

If no results arrive:
- Confirm backend log shows TCP listener started on `5600`.
- Confirm analyzer can reach backend host/port (firewall/routing).
- Confirm instrument record is `Active` and `TCP_SERVER`.

If unmatched results appear:
- Verify analyzer sends order number in `OBR-3`.
- Verify order number exists in LIS.
- Verify all analyzer test codes are mapped.
