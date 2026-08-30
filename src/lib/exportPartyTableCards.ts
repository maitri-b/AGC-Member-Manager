// Export Party Table Cards to Excel with Beautiful Formatting
// Layout: A5 Landscape with duplicated content (for A6 Portrait when folded)
import * as XLSX from 'xlsx-js-style';

interface Member {
  name: string;
  registrationId: string;
  companyName?: string;
  lineDisplayName?: string;
}

interface TableGroup {
  tableGroupName?: string;
  hostCompanyName?: string;
  hostContactName?: string;
  members: Member[];
  isReservation?: boolean;
  reservedSeats?: number;
}

interface TableSlot {
  tableNumber: number;
  groups: TableGroup[];
}

interface CompanyGroup {
  companyName: string;
  members: string[];
  count: number;
}

// A4 Portrait layout - 1 table per page (using half-page height)
// Each table has fixed number of rows to fit half A4 portrait height
// Simple 3-column layout: [spacing] [content] [count]
const CONTENT_COLS = 3; // Just 3 columns: empty, content, count
const ROWS_PER_TABLE = 28; // Fixed rows per table (including header, total, content, empty rows) - half A4 portrait

export function exportPartyTableCards(tableSlots: TableSlot[], eventName: string) {
  // Sort table slots by table number
  const sortedSlots = [...tableSlots].sort((a, b) => a.tableNumber - b.tableNumber);

  const timestamp = new Date().toISOString().split('T')[0];
  const baseFilename = eventName.replace(/[^a-zA-Z0-9ก-๙]/g, '_');

  // Create workbook 1: Detailed version (with member names)
  const wbDetailed = XLSX.utils.book_new();
  sortedSlots.forEach((slot) => {
    const sheet = createSingleTableSheet(slot, true); // true = detailed with member names
    XLSX.utils.book_append_sheet(wbDetailed, sheet, `โต๊ะ ${slot.tableNumber}`);
  });

  // Create workbook 2: Summary version (without member names)
  const wbSummary = XLSX.utils.book_new();
  sortedSlots.forEach((slot) => {
    const sheet = createSingleTableSheet(slot, false); // false = summary without member names
    XLSX.utils.book_append_sheet(wbSummary, sheet, `โต๊ะ ${slot.tableNumber}`);
  });

  // Download detailed file
  const filenameDetailed = `Party_Table_Cards_${baseFilename}_รายละเอียด_${timestamp}.xlsx`;
  XLSX.writeFile(wbDetailed, filenameDetailed);

  // Download summary file
  const filenameSummary = `Party_Table_Cards_${baseFilename}_สรุป_${timestamp}.xlsx`;
  XLSX.writeFile(wbSummary, filenameSummary);

  return `${filenameDetailed}, ${filenameSummary}`;
}

function groupMembersByCompany(slot: TableSlot): CompanyGroup[] {
  const companyMap: { [key: string]: CompanyGroup } = {};

  slot.groups.forEach((group) => {
    if (group.isReservation) {
      const reservationName = group.tableGroupName || 'โต๊ะจอง';
      const seats = group.reservedSeats || 0;

      if (!companyMap[reservationName]) {
        companyMap[reservationName] = {
          companyName: reservationName,
          members: [],
          count: 0,
        };
      }
      companyMap[reservationName].count += seats;
    } else {
      group.members.forEach((member) => {
        const companyName = member.companyName || group.hostCompanyName || 'ไม่ระบุบริษัท';

        if (!companyMap[companyName]) {
          companyMap[companyName] = {
            companyName: companyName,
            members: [],
            count: 0,
          };
        }

        companyMap[companyName].members.push(member.name);
        companyMap[companyName].count++;
      });
    }
  });

  return Object.values(companyMap).sort((a, b) => b.count - a.count);
}

function createCardData(slot: TableSlot): any[][] {
  const companies = groupMembersByCompany(slot);
  const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);
  const data: any[][] = [];

  // Header row (table number)
  data.push([`โต๊ะที่ ${slot.tableNumber}`, '', `รวม ${totalMembers} คน`]);

  // Empty row
  data.push(['', '', '']);

  // Company groups
  companies.forEach((company, idx) => {
    // Company header
    data.push(['', company.companyName, `${company.count} คน`]);

    // Member names (only if not reservation)
    if (company.members.length > 0) {
      company.members.forEach((memberName) => {
        data.push(['', `  • ${memberName}`, '']);
      });
    }

    // Separator between companies (except last)
    if (idx < companies.length - 1) {
      data.push(['', '─────────────────────────────', '']);
    }
  });

  return data;
}

// Create a single table sheet (1 table = 1 sheet = 1 A4 page)
function createSingleTableSheet(slot: TableSlot, showMemberNames: boolean): XLSX.WorkSheet {
  const companies = groupMembersByCompany(slot);
  const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);
  const data: any[][] = [];

  // Header row with purple background (merge all 3 columns)
  data.push([`โต๊ะที่ ${slot.tableNumber}`, '', '']);

  // Total count row (centered)
  data.push(['', `รวม ${totalMembers} คน`, '']);

  // Empty row after header
  data.push(['', '', '']);

  // Company groups
  companies.forEach((company, idx) => {
    // Company header
    data.push(['', company.companyName, `${company.count} คน`]);

    // Member names (only if showMemberNames is true and not reservation)
    if (showMemberNames && company.members.length > 0) {
      company.members.forEach((memberName) => {
        data.push(['', `  • ${memberName}`, '']);
      });
    }

    // Separator between companies (except last)
    if (idx < companies.length - 1) {
      data.push(['', '─────────────────────────────', '']);
    }
  });

  // Calculate current row count
  const currentRowCount = data.length;

  // Pad with empty rows to reach ROWS_PER_TABLE (half A4)
  const rowsToAdd = ROWS_PER_TABLE - currentRowCount;
  for (let i = 0; i < rowsToAdd; i++) {
    data.push(['', '', '']);
  }

  // Create worksheet from data
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Track header rows for merging
  const merges: XLSX.Range[] = [];

  // Apply styles to each cell
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];

      if (!cell) continue;

      const cellValue = cell.v;
      let style: any = {};

      // Header rows (โต๊ะที่ X) - ONLY colored element, merge all 3 columns
      if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('โต๊ะที่')) {
        style = {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: '7C3AED' } },
          border: {
            top: { style: 'medium', color: { rgb: '7C3AED' } },
            bottom: { style: 'medium', color: { rgb: '7C3AED' } },
            left: { style: 'medium', color: { rgb: '7C3AED' } },
            right: { style: 'medium', color: { rgb: '7C3AED' } },
          },
        };

        // Add merge for all 3 columns (A, B, C) for this header row
        if (C === 0) {
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 2 } });
        }
      }
      // Total count row (รวม X คน) - centered
      else if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('รวม') && cellValue.includes('คน')) {
        style = {
          font: { sz: 12, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      // Count cells (X คน) - left aligned
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน')) {
        style = {
          font: { sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
      // Company names (check if next column has count)
      else if (C === 1 && cellValue && !String(cellValue).startsWith('  •') && !String(cellValue).includes('─')) {
        const nextCell = ws[XLSX.utils.encode_cell({ r: R, c: C + 1 })];
        if (nextCell && nextCell.v && String(nextCell.v).includes('คน')) {
          style = {
            font: { sz: showMemberNames ? 12 : 13 },
            alignment: { horizontal: 'left', vertical: 'center' },
          };
        }
      }
      // Member names (with bullet)
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('•')) {
        style = {
          font: { sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
      // Separator lines
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
        style = {
          font: { sz: 10, color: { rgb: 'CCCCCC' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }

      cell.s = style;
    }
  }

  // Apply merges
  ws['!merges'] = merges;

  // Set column widths (3 columns only)
  ws['!cols'] = [
    { wch: 2 },   // Column A: spacing
    { wch: 50 },  // Column B: content (wider for names)
    { wch: 12 },  // Column C: count
  ];

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i <= range.e.r; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 30 }; // Header row
    } else if (cellB && cellB.v && String(cellB.v).startsWith('รวม') && String(cellB.v).includes('คน')) {
      rows[i] = { hpt: 25 }; // Total count row
    } else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rows[i] = { hpt: 8 }; // Separator
    } else if (cellB && cellB.v) {
      rows[i] = { hpt: showMemberNames ? 18 : 20 }; // Content rows
    } else {
      rows[i] = { hpt: 15 }; // Empty rows
    }
  }
  ws['!rows'] = rows;

  // Add light border around content area (rows 0 to ROWS_PER_TABLE-1)
  const lastContentRow = ROWS_PER_TABLE - 1;
  for (let R = 0; R <= lastContentRow; R++) {
    for (let C = 0; C <= 2; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];

      if (cell && cell.s) {
        // Skip header row which already has borders
        if (cell.v && typeof cell.v === 'string' && cell.v.startsWith('โต๊ะที่')) {
          continue;
        }

        // Add light gray borders
        const borderStyle = { style: 'thin', color: { rgb: 'E5E7EB' } };
        cell.s.border = {
          top: R === 0 ? borderStyle : undefined,
          bottom: R === lastContentRow ? borderStyle : undefined,
          left: C === 0 ? borderStyle : undefined,
          right: C === 2 ? borderStyle : undefined,
        };
      }
    }
  }

  // Set page margins: left 0.25cm, top 0.25cm (1 inch = 2.54cm, so 0.25cm ≈ 0.098 inch)
  ws['!margins'] = {
    left: 0.098,  // 0.25 cm
    right: 0.75,  // default
    top: 0.098,   // 0.25 cm
    bottom: 0.75, // default
    header: 0.3,
    footer: 0.3,
  };

  return ws;
}

function createDetailedSheet(sortedSlots: TableSlot[]): XLSX.WorkSheet {
  const data: any[][] = [];

  sortedSlots.forEach((slot, tableIndex) => {
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Start tracking rows for this table
    const tableStartRow = data.length;

    // Header row with purple background (merge all 3 columns)
    data.push([`โต๊ะที่ ${slot.tableNumber}`, '', '']);

    // Total count row (centered)
    data.push(['', `รวม ${totalMembers} คน`, '']);

    // Empty row after header
    data.push(['', '', '']);

    // Company groups
    companies.forEach((company, idx) => {
      // Company header
      data.push(['', company.companyName, `${company.count} คน`]);

      // Member names (only if not reservation)
      if (company.members.length > 0) {
        company.members.forEach((memberName) => {
          data.push(['', `  • ${memberName}`, '']);
        });
      }

      // Separator between companies (except last)
      if (idx < companies.length - 1) {
        data.push(['', '─────────────────────────────', '']);
      }
    });

    // Calculate current row count for this table
    const currentRowCount = data.length - tableStartRow;

    // Pad with empty rows to reach ROWS_PER_TABLE
    const rowsToAdd = ROWS_PER_TABLE - currentRowCount;
    for (let i = 0; i < rowsToAdd; i++) {
      data.push(['', '', '']);
    }
  });

  // Create worksheet from data
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Track header rows for merging
  const merges: XLSX.Range[] = [];

  // Apply styles to each cell
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];

      if (!cell) continue;

      const cellValue = cell.v;
      let style: any = {};

      // Header rows (โต๊ะที่ X) - ONLY colored element, merge all 3 columns
      if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('โต๊ะที่')) {
        style = {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: '7C3AED' } },
          border: {
            top: { style: 'medium', color: { rgb: '7C3AED' } },
            bottom: { style: 'medium', color: { rgb: '7C3AED' } },
            left: { style: 'medium', color: { rgb: '7C3AED' } },
            right: { style: 'medium', color: { rgb: '7C3AED' } },
          },
        };

        // Add merge for all 3 columns (A, B, C) for this header row
        if (C === 0) {
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 2 } });
        }
      }
      // Total count row (รวม X คน) - centered
      else if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('รวม') && cellValue.includes('คน')) {
        style = {
          font: { sz: 12, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      // Count cells (X คน) - left aligned
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน')) {
        style = {
          font: { sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
      // Company names (check if next column has count)
      else if (C === 1 && cellValue && !String(cellValue).startsWith('  •') && !String(cellValue).includes('─')) {
        const nextCell = ws[XLSX.utils.encode_cell({ r: R, c: C + 1 })];
        if (nextCell && nextCell.v && String(nextCell.v).includes('คน')) {
          style = {
            font: { sz: 12 },
            alignment: { horizontal: 'left', vertical: 'center' },
          };
        }
      }
      // Member names (with bullet)
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('•')) {
        style = {
          font: { sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
      // Separator lines
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
        style = {
          font: { sz: 10, color: { rgb: 'CCCCCC' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }

      cell.s = style;
    }
  }

  // Apply merges
  ws['!merges'] = merges;

  // Set column widths (3 columns only)
  ws['!cols'] = [
    { wch: 2 },   // Column A: spacing
    { wch: 50 },  // Column B: content (wider for names)
    { wch: 12 },  // Column C: count
  ];

  // Set row heights and page breaks
  const rows: XLSX.RowInfo[] = [];
  let currentRow = 0;

  for (let i = 0; i <= range.e.r; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      // Add page break before each new table (except first table)
      if (i > 0) {
        rows[i] = { hpt: 30, hpx: 30 };
      } else {
        rows[i] = { hpt: 30 }; // Header row - smaller height
      }
      currentRow = i;
    } else if (cellB && cellB.v && String(cellB.v).startsWith('รวม') && String(cellB.v).includes('คน')) {
      rows[i] = { hpt: 25 }; // Total count row
    } else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rows[i] = { hpt: 8 }; // Separator
    } else if (cellB && cellB.v) {
      rows[i] = { hpt: 18 }; // Content rows
    } else {
      rows[i] = { hpt: 15 }; // Empty rows
    }
  }
  ws['!rows'] = rows;

  // Add page breaks - one page per table
  const pageBreaks: number[] = [];
  for (let i = ROWS_PER_TABLE; i < data.length; i += ROWS_PER_TABLE) {
    pageBreaks.push(i);
  }
  if (pageBreaks.length > 0) {
    ws['!pageBreaks'] = { rows: pageBreaks };
  }

  return ws;
}

function createSummarySheet(sortedSlots: TableSlot[]): XLSX.WorkSheet {
  const data: any[][] = [];

  sortedSlots.forEach((slot) => {
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Start tracking rows for this table
    const tableStartRow = data.length;

    // Header row with purple background (merge all 3 columns)
    data.push([`โต๊ะที่ ${slot.tableNumber}`, '', '']);

    // Total count row (centered)
    data.push(['', `รวม ${totalMembers} คน`, '']);

    // Empty row after header
    data.push(['', '', '']);

    // Companies only (no member names)
    companies.forEach((company, idx) => {
      data.push(['', company.companyName, `${company.count} คน`]);

      // Separator between companies (except last)
      if (idx < companies.length - 1) {
        data.push(['', '─────────────────────────────', '']);
      }
    });

    // Calculate current row count for this table
    const currentRowCount = data.length - tableStartRow;

    // Pad with empty rows to reach ROWS_PER_TABLE
    const rowsToAdd = ROWS_PER_TABLE - currentRowCount;
    for (let i = 0; i < rowsToAdd; i++) {
      data.push(['', '', '']);
    }
  });

  // Create worksheet from data
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Track header rows for merging
  const merges: XLSX.Range[] = [];

  // Apply styles to each cell
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];

      if (!cell) continue;

      const cellValue = cell.v;
      let style: any = {};

      // Header rows (โต๊ะที่ X) - ONLY colored element, merge all 3 columns
      if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('โต๊ะที่')) {
        style = {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: '7C3AED' } },
          border: {
            top: { style: 'medium', color: { rgb: '7C3AED' } },
            bottom: { style: 'medium', color: { rgb: '7C3AED' } },
            left: { style: 'medium', color: { rgb: '7C3AED' } },
            right: { style: 'medium', color: { rgb: '7C3AED' } },
          },
        };

        // Add merge for all 3 columns (A, B, C) for this header row
        if (C === 0) {
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 2 } });
        }
      }
      // Total count row (รวม X คน) - centered
      else if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('รวม') && cellValue.includes('คน')) {
        style = {
          font: { sz: 12, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      // Count cells (X คน) - right aligned
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน')) {
        style = {
          font: { sz: 12 },
          alignment: { horizontal: 'right', vertical: 'center' },
        };
      }
      // Company names (check if next column has count)
      else if (C === 1 && cellValue && !String(cellValue).includes('─')) {
        const nextCell = ws[XLSX.utils.encode_cell({ r: R, c: C + 1 })];
        if (nextCell && nextCell.v && String(nextCell.v).includes('คน')) {
          style = {
            font: { sz: 13 },
            alignment: { horizontal: 'left', vertical: 'center' },
          };
        }
      }
      // Separator lines
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
        style = {
          font: { sz: 10, color: { rgb: 'CCCCCC' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }

      cell.s = style;
    }
  }

  // Apply merges
  ws['!merges'] = merges;

  // Set column widths (3 columns only)
  ws['!cols'] = [
    { wch: 2 },   // Column A: spacing
    { wch: 50 },  // Column B: content
    { wch: 12 },  // Column C: count
  ];

  // Set row heights and page breaks
  const rows: XLSX.RowInfo[] = [];
  let currentRow = 0;

  for (let i = 0; i <= range.e.r; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      // Add page break before each new table (except first table)
      if (i > 0) {
        rows[i] = { hpt: 30, hpx: 30 };
      } else {
        rows[i] = { hpt: 30 }; // Header row - smaller height
      }
      currentRow = i;
    } else if (cellB && cellB.v && String(cellB.v).startsWith('รวม') && String(cellB.v).includes('คน')) {
      rows[i] = { hpt: 25 }; // Total count row
    } else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rows[i] = { hpt: 8 }; // Separator
    } else if (cellB && cellB.v) {
      rows[i] = { hpt: 20 }; // Company rows (slightly taller for summary)
    } else {
      rows[i] = { hpt: 15 }; // Empty rows
    }
  }
  ws['!rows'] = rows;

  // Add page breaks - one page per table
  const pageBreaks: number[] = [];
  for (let i = ROWS_PER_TABLE; i < data.length; i += ROWS_PER_TABLE) {
    pageBreaks.push(i);
  }
  if (pageBreaks.length > 0) {
    ws['!pageBreaks'] = { rows: pageBreaks };
  }

  return ws;
}
