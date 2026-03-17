$path = "src/worklist/worklist.service.ts"
$content = Get-Content $path -Raw

$syncTrigger1 = @"
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Trigger background S3 sync for the report
    this.reportsService.syncReportToS3(orderTest.sample.orderId, labId).catch((err) => {
      this.logger.error(`Failed to trigger S3 sync for order ${orderTest.sample.orderId} after verification: ${err.message}`);
    });
"@

$syncTrigger2 = @"
      for (const log of auditLogs) {
        await this.auditService.log(log);
      }

      // Trigger background S3 sync for all affected orders
      for (const orderId of updatedOrderIds) {
        this.reportsService.syncReportToS3(orderId, labId).catch((err) => {
          this.logger.error(`Failed to trigger S3 sync for order ${orderId} after multiple verification: ${err.message}`);
        });
      }
"@

$target1 = "    await this.syncOrderStatus(orderTest.sample.orderId);"
$target2 = @"
      for (const log of auditLogs) {
        await this.auditService.log(log);
      }
"@

if ($content.Contains($target1)) {
    $content = $content.Replace($target1, $syncTrigger1)
    $content = $content.Replace($target2, $syncTrigger2)
    Set-Content $path $content -NoNewline
    Write-Output "Successfully updated $path"
} else {
    Write-Error "Could not find target in $path"
}
