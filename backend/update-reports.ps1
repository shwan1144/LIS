$path = "src/reports/reports.service.ts"
$content = Get-Content $path -Raw

$s3Check = @"
    const snapshotMs = Date.now() - snapshotStartMs;

    // S3 Cache check
    if (!options?.disableCache && !options?.cultureOnly && !options?.reportDesignOverride && (order as any).reportS3Key) {
      try {
        const cachedPdf = await this.fileStorageService.getFile((order as any).reportS3Key);
        return {
          pdf: cachedPdf,
          performance: { orderId, labId, correlationId: options?.correlationId ?? null, totalMs: Date.now() - startMs, snapshotMs, cacheHit: true, inFlightJoin: false },
        };
      } catch (e) { this.logger.warn(`S3 fetch failed: ${e.message}`); }
    }
"@

$target = "    const snapshotMs = Date.now() - snapshotStartMs;"

# Replace the specific occurrence in generateTestResultsPDFWithProfile
# We search for the function name first to be safe, then the line inside it.
# However, snapshotMs is only used in a few places.
if ($content -match "generateTestResultsPDFWithProfile") {
    $content = $content.Replace($target, $s3Check)
    Set-Content $path $content -NoNewline
    Write-Output "Successfully updated $path"
} else {
    Write-Error "Could not find target in $path"
}
