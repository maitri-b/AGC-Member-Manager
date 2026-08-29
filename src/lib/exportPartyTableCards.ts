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

// A4 Portrait layout - 2 tables per page (top and bottom)
// Each table card uses left half of the page
// A4 = 210mm wide, half = 105mm ≈ 40 Excel columns
const CARD_WIDTH = 40; // columns per card (left half of A4)
const ROWS_PER_PAGE = 2; // 2 tables per A4 page (top and bottom)

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
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let currentRow = 0;

  sortedSlots.forEach((slot, tableIndex) => {
    const cardData = createCardData(slot);
    const cardHeight = cardData.length;

    // Single card on left half of page
    cardData.forEach((row, rowIdx) => {
      const actualRow = currentRow + rowIdx;

      row.forEach((cellValue, colIdx) => {
        const actualCol = colIdx;
        const cellRef = XLSX.utils.encode_cell({ r: actualRow, c: actualCol });

        // Determine cell style based on content
        let cellStyle: any = {};

        // Header row (table number) - ONLY colored element
        if (rowIdx === 0) {
          cellStyle = {
            font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            fill: { fgColor: { rgb: '7C3AED' } }, // Purple header
            border: {
              top: { style: 'medium', color: { rgb: '7C3AED' } },
              bottom: { style: 'medium', color: { rgb: '7C3AED' } },
              left: { style: 'medium', color: { rgb: '7C3AED' } },
              right: { style: 'medium', color: { rgb: '7C3AED' } },
            },
          };

          // Merge header cells
          if (colIdx === 0) {
            merges.push({ s: { r: actualRow, c: actualCol }, e: { r: actualRow, c: actualCol + 1 } });
          }
        }
        // Count column (right-aligned)
        else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน') && colIdx === 2) {
          cellStyle = {
            font: { bold: true, sz: 12, color: { rgb: '374151' } },
            alignment: { horizontal: 'right', vertical: 'center' },
          };
        }
        // Company name (bold, no background)
        else if (cellValue && colIdx === 1 && !cellValue.startsWith('  •') && !cellValue.includes('─')) {
          const nextCellHasCount = row[2] && String(row[2]).includes('คน');
          if (nextCellHasCount) {
            cellStyle = {
              font: { bold: true, sz: 13, color: { rgb: '111827' } },
              alignment: { horizontal: 'left', vertical: 'center' },
            };
          }
        }
        // Member rows (regular text with bullet)
        else if (cellValue && typeof cellValue === 'string' && cellValue.includes('•')) {
          cellStyle = {
            font: { sz: 12, color: { rgb: '6B7280' } },
            alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
          };
        }
        // Separator lines (horizontal divider between companies)
        else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
          cellStyle = {
            font: { color: { rgb: 'D1D5DB' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
          };
        }

        ws[cellRef] = { v: cellValue, t: 's', s: cellStyle };
      });
    });

    // Move to next table with spacing
    currentRow += cardHeight + 4;
  });

  // Set column widths - left half of A4 only
  const cols: XLSX.ColInfo[] = [];
  for (let i = 0; i < CARD_WIDTH; i++) {
    if (i === 0) {
      cols.push({ wch: 3 }); // Narrow first column for spacing
    } else if (i < CARD_WIDTH - 8) {
      cols.push({ wch: 4 }); // Main content area (company/member names)
    } else {
      cols.push({ wch: 3 }); // Count column area
    }
  }
  ws['!cols'] = cols;

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i < currentRow; i++) {
    // Check if this is a header row
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 35 }; // Header row - taller
    } else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rows[i] = { hpt: 10 }; // Separator line
    } else if (cellB && cellB.v) {
      rows[i] = { hpt: 22 }; // Content rows
    } else {
      rows[i] = { hpt: 20 }; // Empty rows
    }
  }
  ws['!rows'] = rows;

  // Apply merges
  ws['!merges'] = merges;

  // Set range - left half of A4 only
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentRow - 1, c: CARD_WIDTH - 1 }
  });

  return ws;
}

function createSummarySheet(sortedSlots: TableSlot[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let currentRow = 0;

  sortedSlots.forEach((slot) => {
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);
    const cardData: any[][] = [];

    // Header
    cardData.push([`โต๊ะที่ ${slot.tableNumber}`, '', `รวม ${totalMembers} คน`]);
    cardData.push(['', '', '']);

    // Companies only
    companies.forEach((company, idx) => {
      cardData.push(['', company.companyName, `${company.count} คน`]);
      if (idx < companies.length - 1) {
        cardData.push(['', '─────────────────────────────', '']);
      }
    });

    const cardHeight = cardData.length;

    // Single card on left half
    cardData.forEach((row, rowIdx) => {
      const actualRow = currentRow + rowIdx;

      row.forEach((cellValue, colIdx) => {
        const actualCol = colIdx;
        const cellRef = XLSX.utils.encode_cell({ r: actualRow, c: actualCol });

        let cellStyle: any = {};

        // Header row - ONLY colored element
        if (rowIdx === 0) {
          cellStyle = {
            font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            fill: { fgColor: { rgb: '7C3AED' } },
            border: {
              top: { style: 'medium', color: { rgb: '7C3AED' } },
              bottom: { style: 'medium', color: { rgb: '7C3AED' } },
              left: { style: 'medium', color: { rgb: '7C3AED' } },
              right: { style: 'medium', color: { rgb: '7C3AED' } },
            },
          };

          if (colIdx === 0) {
            merges.push({ s: { r: actualRow, c: actualCol }, e: { r: actualRow, c: actualCol + 1 } });
          }
        }
        // Count column
        else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน') && colIdx === 2) {
          cellStyle = {
            font: { bold: true, sz: 13, color: { rgb: '374151' } },
            alignment: { horizontal: 'right', vertical: 'center' },
          };
        }
        // Company name
        else if (cellValue && colIdx === 1 && !cellValue.includes('─')) {
          const nextCellHasCount = row[2] && String(row[2]).includes('คน');
          if (nextCellHasCount) {
            cellStyle = {
              font: { bold: true, sz: 14, color: { rgb: '111827' } },
              alignment: { horizontal: 'left', vertical: 'center' },
            };
          }
        }
        // Separator lines
        else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
          cellStyle = {
            font: { color: { rgb: 'D1D5DB' }, sz: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
          };
        }

        ws[cellRef] = { v: cellValue, t: 's', s: cellStyle };
      });
    });

    currentRow += cardHeight + 4;
  });

  // Set column widths - left half of A4 only
  const cols: XLSX.ColInfo[] = [];
  for (let i = 0; i < CARD_WIDTH; i++) {
    if (i === 0) {
      cols.push({ wch: 3 });
    } else if (i < CARD_WIDTH - 8) {
      cols.push({ wch: 4 });
    } else {
      cols.push({ wch: 3 });
    }
  }
  ws['!cols'] = cols;

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i < currentRow; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];

    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 35 }; // Header row
    } else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rows[i] = { hpt: 10 }; // Separator line
    } else if (cellB && cellB.v) {
      rows[i] = { hpt: 24 }; // Company rows (slightly taller for summary)
    } else {
      rows[i] = { hpt: 20 }; // Empty rows
    }
  }
  ws['!rows'] = rows;

  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentRow - 1, c: CARD_WIDTH - 1 }
  });

  return ws;
}
