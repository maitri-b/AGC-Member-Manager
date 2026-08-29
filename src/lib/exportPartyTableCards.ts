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

// A5 Landscape dimensions - simple table layout
// A5 = 210mm x 148mm landscape = 148mm wide
// Simple 3-column layout: [spacing] [content] [count]
const CONTENT_COLS = 3; // Just 3 columns: empty, content, count

export function exportPartyTableCards(tableSlots: TableSlot[], eventName: string) {
  // Sort table slots by table number
  const sortedSlots = [...tableSlots].sort((a, b) => a.tableNumber - b.tableNumber);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Process each sheet
  const detailedSheet = createDetailedSheet(sortedSlots);
  const summarySheet = createSummarySheet(sortedSlots);

  // Add sheets to workbook
  XLSX.utils.book_append_sheet(wb, detailedSheet, 'การ์ดโต๊ะ (รายละเอียด)');
  XLSX.utils.book_append_sheet(wb, summarySheet, 'การ์ดโต๊ะ (สรุป)');

  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `Party_Table_Cards_${eventName.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}_${timestamp}.xlsx`;

  // Download file
  XLSX.writeFile(wb, filename);

  return filename;
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

function createDetailedSheet(sortedSlots: TableSlot[]): XLSX.WorkSheet {
  const data: any[][] = [];

  sortedSlots.forEach((slot, tableIndex) => {
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Header row with purple background
    data.push([`โต๊ะที่ ${slot.tableNumber}`, '', `รวม ${totalMembers} คน`]);

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

    // Spacing between tables
    data.push(['', '', '']);
    data.push(['', '', '']);
    data.push(['', '', '']);
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

      // Header rows (โต๊ะที่ X) - ONLY colored element
      if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('โต๊ะที่')) {
        style = {
          font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: '7C3AED' } },
          border: {
            top: { style: 'medium', color: { rgb: '7C3AED' } },
            bottom: { style: 'medium', color: { rgb: '7C3AED' } },
            left: { style: 'medium', color: { rgb: '7C3AED' } },
            right: { style: 'medium', color: { rgb: '7C3AED' } },
          },
        };

        // Add merge for columns A and B for this header row
        if (C === 0) {
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 1 } });
        }
      }
      // Count cells (X คน)
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน')) {
        style = {
          font: { bold: true, sz: 11 },
          alignment: { horizontal: 'right', vertical: 'center' },
        };
      }
      // Company names (check if next column has count)
      else if (C === 1 && cellValue && !String(cellValue).startsWith('  •') && !String(cellValue).includes('─')) {
        const nextCell = ws[XLSX.utils.encode_cell({ r: R, c: C + 1 })];
        if (nextCell && nextCell.v && String(nextCell.v).includes('คน')) {
          style = {
            font: { bold: true, sz: 12 },
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

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 40 }; // Header row - taller to fit font
    } else {
      const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];
      if (cellB && cellB.v && String(cellB.v).includes('─')) {
        rows[i] = { hpt: 8 }; // Separator
      } else if (cellB && cellB.v) {
        rows[i] = { hpt: 18 }; // Content rows
      } else {
        rows[i] = { hpt: 15 }; // Empty rows
      }
    }
  }
  ws['!rows'] = rows;

  return ws;
}

function createSummarySheet(sortedSlots: TableSlot[]): XLSX.WorkSheet {
  const data: any[][] = [];

  sortedSlots.forEach((slot) => {
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Header row with purple background
    data.push([`โต๊ะที่ ${slot.tableNumber}`, '', `รวม ${totalMembers} คน`]);

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

    // Spacing between tables
    data.push(['', '', '']);
    data.push(['', '', '']);
    data.push(['', '', '']);
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

      // Header rows (โต๊ะที่ X) - ONLY colored element
      if (cellValue && typeof cellValue === 'string' && cellValue.startsWith('โต๊ะที่')) {
        style = {
          font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: '7C3AED' } },
          border: {
            top: { style: 'medium', color: { rgb: '7C3AED' } },
            bottom: { style: 'medium', color: { rgb: '7C3AED' } },
            left: { style: 'medium', color: { rgb: '7C3AED' } },
            right: { style: 'medium', color: { rgb: '7C3AED' } },
          },
        };

        // Add merge for columns A and B for this header row
        if (C === 0) {
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 1 } });
        }
      }
      // Count cells (X คน)
      else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน')) {
        style = {
          font: { bold: true, sz: 12 },
          alignment: { horizontal: 'right', vertical: 'center' },
        };
      }
      // Company names (check if next column has count)
      else if (C === 1 && cellValue && !String(cellValue).includes('─')) {
        const nextCell = ws[XLSX.utils.encode_cell({ r: R, c: C + 1 })];
        if (nextCell && nextCell.v && String(nextCell.v).includes('คน')) {
          style = {
            font: { bold: true, sz: 13 },
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

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i <= range.e.r; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 40 }; // Header row - taller to fit font
    } else {
      const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];
      if (cellB && cellB.v && String(cellB.v).includes('─')) {
        rows[i] = { hpt: 8 }; // Separator
      } else if (cellB && cellB.v) {
        rows[i] = { hpt: 20 }; // Company rows (slightly taller for summary)
      } else {
        rows[i] = { hpt: 15 }; // Empty rows
      }
    }
  }
  ws['!rows'] = rows;

  return ws;
}
