"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESULTS_REPORT_PRINT_ERROR_EVENT = exports.RESULTS_REPORT_PRINT_READY_EVENT = exports.RESULTS_REPORT_PRINT_ERROR_FLAG = exports.RESULTS_REPORT_PRINT_READY_FLAG = void 0;
exports.prepareResultsReportDocumentForPrint = prepareResultsReportDocumentForPrint;
exports.injectResultsReportPrintPreparationScript = injectResultsReportPrintPreparationScript;
exports.RESULTS_REPORT_PRINT_READY_FLAG = '__lisResultsPrintReady';
exports.RESULTS_REPORT_PRINT_ERROR_FLAG = '__lisResultsPrintError';
exports.RESULTS_REPORT_PRINT_READY_EVENT = 'lis-results-print-ready';
exports.RESULTS_REPORT_PRINT_ERROR_EVENT = 'lis-results-print-error';
async function prepareResultsReportDocumentForPrint() {
    const fontReady = document.fonts?.ready;
    if (fontReady) {
        try {
            await fontReady;
        }
        catch {
        }
    }
    const images = Array.from(document.images || []);
    await Promise.all(images
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => {
        const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
    })));
    const createMmProbe = () => {
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.height = '100mm';
        probe.style.width = '1mm';
        document.body.appendChild(probe);
        const pxPerMm = probe.getBoundingClientRect().height / 100;
        probe.remove();
        return pxPerMm || 3.78;
    };
    const pxPerMm = createMmProbe();
    const toMm = (px) => (pxPerMm > 0 ? px / pxPerMm : px);
    const header = document.querySelector('.report-header');
    if (header) {
        const prevHeight = header.style.height;
        const prevMinHeight = header.style.minHeight;
        header.style.height = 'auto';
        header.style.minHeight = '0';
        const headerRect = header.getBoundingClientRect();
        let contentBottom = headerRect.top;
        const title = header.querySelector('.report-title');
        if (title) {
            const rect = title.getBoundingClientRect();
            let marginBottom = 0;
            try {
                const style = window.getComputedStyle(title);
                marginBottom = parseFloat(style.marginBottom || '0') || 0;
            }
            catch {
                marginBottom = 0;
            }
            contentBottom = rect.bottom + marginBottom;
        }
        else {
            const headerChildren = Array.from(header.children || []);
            for (const child of headerChildren) {
                const rect = child.getBoundingClientRect();
                if (rect.bottom > contentBottom) {
                    contentBottom = rect.bottom;
                }
            }
            const lastChild = header.lastElementChild;
            if (lastChild) {
                try {
                    const style = window.getComputedStyle(lastChild);
                    const marginBottom = parseFloat(style.marginBottom || '0') || 0;
                    if (marginBottom > 0) {
                        contentBottom += marginBottom;
                    }
                }
                catch {
                }
            }
        }
        const measuredHeight = contentBottom > headerRect.top
            ? contentBottom - headerRect.top + 4
            : Math.max(header.scrollHeight, headerRect.height);
        let cloneHeight = 0;
        try {
            const clone = header.cloneNode(true);
            clone.style.position = 'static';
            clone.style.visibility = 'hidden';
            clone.style.height = 'auto';
            clone.style.minHeight = '0';
            clone.style.maxHeight = 'none';
            clone.style.overflow = 'visible';
            clone.style.pointerEvents = 'none';
            clone.style.top = 'auto';
            clone.style.left = 'auto';
            clone.style.right = 'auto';
            clone.style.zIndex = '-1';
            document.body.prepend(clone);
            cloneHeight = clone.getBoundingClientRect().height || 0;
            clone.remove();
        }
        catch {
            cloneHeight = 0;
        }
        const finalHeight = Math.max(measuredHeight, cloneHeight);
        if (finalHeight > 0) {
            const roundedMm = Math.ceil(toMm(finalHeight) * 10) / 10;
            document.body.style.setProperty('--header-reserved-height', `${roundedMm}mm`);
        }
        header.style.height = prevHeight;
        header.style.minHeight = prevMinHeight;
    }
    const footer = document.querySelector('.report-footer');
    if (footer) {
        const prevHeight = footer.style.height;
        const prevMinHeight = footer.style.minHeight;
        footer.style.height = 'auto';
        footer.style.minHeight = '0';
        const footerRect = footer.getBoundingClientRect();
        const footerStyle = window.getComputedStyle(footer);
        const footerPaddingBottom = parseFloat(footerStyle.paddingBottom || '0') || 0;
        let contentBottom = footerRect.top;
        const footerChildren = Array.from(footer.children || []);
        for (const child of footerChildren) {
            const rect = child.getBoundingClientRect();
            if (rect.bottom > contentBottom) {
                contentBottom = rect.bottom;
            }
        }
        const measuredHeight = contentBottom > footerRect.top
            ? contentBottom - footerRect.top + footerPaddingBottom
            : Math.max(footer.scrollHeight, footerRect.height);
        if (measuredHeight > 0) {
            const roundedMm = Math.ceil(toMm(measuredHeight) * 10) / 10;
            document.body.style.setProperty('--footer-height', `${roundedMm}mm`);
        }
        footer.style.height = prevHeight;
        footer.style.minHeight = prevMinHeight;
    }
    const table = document.querySelector('table.regular-results-table');
    if (!table) {
        return;
    }
    const sourcePage = table.closest('.page');
    const sourceContent = table.closest('.content');
    if (!sourcePage || !sourceContent) {
        return;
    }
    const tableHead = table.querySelector('thead');
    const tableFoot = table.querySelector('tfoot');
    const tableColGroup = table.querySelector('colgroup');
    if (!tableHead || !tableFoot) {
        return;
    }
    const pageComments = sourceContent.querySelector('.comments');
    const headerSpace = table.querySelector('thead .page-header-space');
    const footerSpace = table.querySelector('tfoot .page-footer-space');
    const headerRows = Array.from(table.querySelectorAll('thead tr'));
    const columnHeaderRow = headerRows[headerRows.length - 1] ?? null;
    const bodyStyle = window.getComputedStyle(document.body);
    const pageHeightPx = Math.max(1, 297 * pxPerMm);
    const marginTopPx = (parseFloat(bodyStyle.getPropertyValue('--page-margin-top') || '0') || 0) * pxPerMm;
    const marginBottomPx = (parseFloat(bodyStyle.getPropertyValue('--page-margin-bottom') || '0') || 0) * pxPerMm;
    const printableHeightPx = Math.max(1, pageHeightPx - marginTopPx - marginBottomPx);
    const headerSpaceHeight = headerSpace?.getBoundingClientRect().height || 0;
    const footerSpaceHeight = footerSpace?.getBoundingClientRect().height || 0;
    const columnHeaderHeight = columnHeaderRow?.getBoundingClientRect().height || 0;
    const paginationSafetyPx = Math.ceil(pxPerMm * 2);
    const availableBodyHeight = Math.max(24, printableHeightPx -
        headerSpaceHeight -
        footerSpaceHeight -
        columnHeaderHeight -
        paginationSafetyPx);
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.getAttribute('data-repeat') !== '1');
    if (rows.length === 0) {
        return;
    }
    const chunks = [];
    let currentRows = [];
    let currentHeight = 0;
    let lastDept = { row: null, height: 0 };
    let lastCat = { row: null, height: 0 };
    const cloneRepeatRow = (row) => {
        if (!row)
            return null;
        const clone = row.cloneNode(true);
        clone.setAttribute('data-repeat', '1');
        return clone;
    };
    const pushChunk = () => {
        if (currentRows.length === 0)
            return;
        chunks.push({ rows: currentRows, comments: false });
        currentRows = [];
        currentHeight = 0;
    };
    for (const row of rows) {
        const rowHeight = Math.ceil(row.getBoundingClientRect().height || 0);
        const isDeptRow = row.classList.contains('dept-row');
        const isCatRow = row.classList.contains('cat-row');
        if (currentRows.length > 0 && currentHeight + rowHeight > availableBodyHeight) {
            pushChunk();
            if (!isDeptRow && !isCatRow) {
                if (lastDept.row) {
                    const deptClone = cloneRepeatRow(lastDept.row);
                    if (deptClone) {
                        currentRows.push(deptClone);
                        currentHeight += lastDept.height;
                    }
                }
                if (lastCat.row) {
                    const catClone = cloneRepeatRow(lastCat.row);
                    if (catClone) {
                        currentRows.push(catClone);
                        currentHeight += lastCat.height;
                    }
                }
            }
            else if (isCatRow && lastDept.row) {
                const deptClone = cloneRepeatRow(lastDept.row);
                if (deptClone) {
                    currentRows.push(deptClone);
                    currentHeight += lastDept.height;
                }
            }
        }
        currentRows.push(row.cloneNode(true));
        currentHeight += rowHeight;
        if (isDeptRow) {
            lastDept = { row, height: rowHeight };
            lastCat = { row: null, height: 0 };
        }
        else if (isCatRow) {
            lastCat = { row, height: rowHeight };
        }
    }
    pushChunk();
    if (chunks.length === 0) {
        return;
    }
    chunks[chunks.length - 1].comments = Boolean(pageComments);
    const createPage = (chunk) => {
        const pageEl = document.createElement('div');
        pageEl.className = 'page regular-results-page';
        const contentEl = document.createElement('div');
        contentEl.className = 'content';
        const nextTable = document.createElement('table');
        nextTable.className = table.className;
        if (tableColGroup) {
            nextTable.appendChild(tableColGroup.cloneNode(true));
        }
        nextTable.appendChild(tableHead.cloneNode(true));
        const tbody = document.createElement('tbody');
        tbody.className = 'regular-dept-block';
        for (const row of chunk.rows) {
            tbody.appendChild(row);
        }
        nextTable.appendChild(tbody);
        nextTable.appendChild(tableFoot.cloneNode(true));
        contentEl.appendChild(nextTable);
        if (chunk.comments && pageComments) {
            contentEl.appendChild(pageComments.cloneNode(true));
        }
        pageEl.appendChild(contentEl);
        return pageEl;
    };
    const parent = sourcePage.parentElement;
    if (!parent) {
        return;
    }
    const newPages = chunks.map((chunk) => createPage(chunk));
    parent.insertBefore(newPages[0], sourcePage);
    for (let i = 1; i < newPages.length; i += 1) {
        parent.insertBefore(newPages[i], sourcePage);
    }
    sourcePage.remove();
}
function injectResultsReportPrintPreparationScript(html) {
    const script = `
<script>
(function () {
  var READY_FLAG = ${JSON.stringify(exports.RESULTS_REPORT_PRINT_READY_FLAG)};
  var ERROR_FLAG = ${JSON.stringify(exports.RESULTS_REPORT_PRINT_ERROR_FLAG)};
  var READY_EVENT = ${JSON.stringify(exports.RESULTS_REPORT_PRINT_READY_EVENT)};
  var ERROR_EVENT = ${JSON.stringify(exports.RESULTS_REPORT_PRINT_ERROR_EVENT)};
  window[READY_FLAG] = false;
  window[ERROR_FLAG] = null;
  var run = ${prepareResultsReportDocumentForPrint.toString()};
  Promise.resolve()
    .then(function () { return run(); })
    .then(function () {
      window[READY_FLAG] = true;
      window.dispatchEvent(new CustomEvent(READY_EVENT));
    })
    .catch(function (error) {
      var message = error instanceof Error ? error.message : 'Failed to prepare report for printing.';
      window[ERROR_FLAG] = message;
      window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: { message: message } }));
    });
})();
</script>`;
    if (html.includes('</body>')) {
        return html.replace('</body>', `${script}\n</body>`);
    }
    return `${html}\n${script}`;
}
//# sourceMappingURL=results-report-print-prep.js.map