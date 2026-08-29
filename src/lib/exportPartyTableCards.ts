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

// A5 Landscape dimensions in Excel columns (approximate)
// A5 = 210mm x 148mm landscape = 148mm wide
// Each half (for A6 portrait) = 74mm wide ≈ 28 Excel columns
const CARD_WIDTH = 28; // columns per card
const CARD_SPACING = 2; // columns between cards

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

    // Add card twice (left and right) for A5 landscape
    for (let side = 0; side < 2; side++) {
      const startCol = side * (CARD_WIDTH + CARD_SPACING);

      cardData.forEach((row, rowIdx) => {
        const actualRow = currentRow + rowIdx;

        row.forEach((cellValue, colIdx) => {
          const actualCol = startCol + colIdx;
          const cellRef = XLSX.utils.encode_cell({ r: actualRow, c: actualCol });

          // Determine cell style based on content
          let cellStyle: any = {};

          // Header row (table number)
          if (rowIdx === 0) {
            cellStyle = {
              font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: colIdx === 0 ? 'center' : (colIdx === 2 ? 'center' : 'center'), vertical: 'center', wrapText: true },
              fill: { fgColor: { rgb: '7C3AED' } },
              border: {
                top: { style: 'thin', color: { rgb: '000000' } },
                bottom: { style: 'thin', color: { rgb: '000000' } },
                left: { style: 'thin', color: { rgb: '000000' } },
                right: { style: 'thin', color: { rgb: '000000' } },
              },
            };

            // Merge header cells
            if (colIdx === 0 && side === 0) {
              merges.push({ s: { r: actualRow, c: actualCol }, e: { r: actualRow, c: actualCol + 1 } });
            }
          }
          // Company header rows
          else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน') && colIdx === 2) {
            cellStyle = {
              font: { bold: true, sz: 11, color: { rgb: '7C3AED' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              fill: { fgColor: { rgb: 'E5E7EB' } },
            };
          }
          else if (cellValue && colIdx === 1 && !cellValue.startsWith('  •') && !cellValue.includes('─')) {
            // Check if this is a company name (next column has "คน")
            const nextCellHasCount = row[2] && String(row[2]).includes('คน');
            if (nextCellHasCount) {
              cellStyle = {
                font: { bold: true, sz: 12, color: { rgb: '1F2937' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                fill: { fgColor: { rgb: 'E5E7EB' } },
              };
            }
          }
          // Member rows
          else if (cellValue && typeof cellValue === 'string' && cellValue.includes('•')) {
            cellStyle = {
              font: { sz: 11, color: { rgb: '4B5563' } },
              alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
            };
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
    }

    // Move to next table (add spacing)
    currentRow += cardHeight + 3;
  });

  // Set column widths
  const cols: XLSX.ColInfo[] = [];
  for (let i = 0; i < (CARD_WIDTH + CARD_SPACING) * 2; i++) {
    const inCard = i % (CARD_WIDTH + CARD_SPACING) < CARD_WIDTH;
    if (inCard) {
      const colInCard = i % (CARD_WIDTH + CARD_SPACING);
      if (colInCard === 0) {
        cols.push({ wch: 2 }); // Narrow first column
      } else if (colInCard < CARD_WIDTH - 5) {
        cols.push({ wch: 3 }); // Main content
      } else {
        cols.push({ wch: 3 }); // Count column
      }
    } else {
      cols.push({ wch: 2 }); // Spacing between cards
    }
  }
  ws['!cols'] = cols;

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i < currentRow; i++) {
    // Check if this is a header row
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 30 };
    } else if (cellA && cellA.v && String(cellA.v).includes('─')) {
      rows[i] = { hpt: 8 };
    } else if (cellA && cellA.v) {
      rows[i] = { hpt: 20 };
    } else {
      rows[i] = { hpt: 18 };
    }
  }
  ws['!rows'] = rows;

  // Apply merges
  ws['!merges'] = merges;

  // Set range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentRow - 1, c: (CARD_WIDTH + CARD_SPACING) * 2 - 1 }
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

    // Add card twice (left and right)
    for (let side = 0; side < 2; side++) {
      const startCol = side * (CARD_WIDTH + CARD_SPACING);

      cardData.forEach((row, rowIdx) => {
        const actualRow = currentRow + rowIdx;

        row.forEach((cellValue, colIdx) => {
          const actualCol = startCol + colIdx;
          const cellRef = XLSX.utils.encode_cell({ r: actualRow, c: actualCol });

          let cellStyle: any = {};

          if (rowIdx === 0) {
            cellStyle = {
              font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              fill: { fgColor: { rgb: '7C3AED' } },
              border: {
                top: { style: 'thin', color: { rgb: '000000' } },
                bottom: { style: 'thin', color: { rgb: '000000' } },
                left: { style: 'thin', color: { rgb: '000000' } },
                right: { style: 'thin', color: { rgb: '000000' } },
              },
            };

            if (colIdx === 0 && side === 0) {
              merges.push({ s: { r: actualRow, c: actualCol }, e: { r: actualRow, c: actualCol + 1 } });
            }
          }
          else if (cellValue && typeof cellValue === 'string' && cellValue.includes('คน') && colIdx === 2) {
            cellStyle = {
              font: { bold: true, sz: 12, color: { rgb: '7C3AED' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              fill: { fgColor: { rgb: 'E5E7EB' } },
            };
          }
          else if (cellValue && colIdx === 1 && !cellValue.includes('─')) {
            const nextCellHasCount = row[2] && String(row[2]).includes('คน');
            if (nextCellHasCount) {
              cellStyle = {
                font: { bold: true, sz: 13, color: { rgb: '1F2937' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                fill: { fgColor: { rgb: 'E5E7EB' } },
              };
            }
          }
          else if (cellValue && typeof cellValue === 'string' && cellValue.includes('─')) {
            cellStyle = {
              font: { color: { rgb: 'D1D5DB' }, sz: 10 },
              alignment: { horizontal: 'center', vertical: 'center' },
            };
          }

          ws[cellRef] = { v: cellValue, t: 's', s: cellStyle };
        });
      });
    }

    currentRow += cardHeight + 3;
  });

  // Set column widths (same as detailed sheet)
  const cols: XLSX.ColInfo[] = [];
  for (let i = 0; i < (CARD_WIDTH + CARD_SPACING) * 2; i++) {
    const inCard = i % (CARD_WIDTH + CARD_SPACING) < CARD_WIDTH;
    if (inCard) {
      const colInCard = i % (CARD_WIDTH + CARD_SPACING);
      if (colInCard === 0) {
        cols.push({ wch: 2 });
      } else if (colInCard < CARD_WIDTH - 5) {
        cols.push({ wch: 3 });
      } else {
        cols.push({ wch: 3 });
      }
    } else {
      cols.push({ wch: 2 });
    }
  }
  ws['!cols'] = cols;

  // Set row heights
  const rows: XLSX.RowInfo[] = [];
  for (let i = 0; i < currentRow; i++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rows[i] = { hpt: 30 };
    } else if (cellA && cellA.v && String(cellA.v).includes('─')) {
      rows[i] = { hpt: 8 };
    } else if (cellA && cellA.v) {
      rows[i] = { hpt: 22 };
    } else {
      rows[i] = { hpt: 18 };
    }
  }
  ws['!rows'] = rows;

  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentRow - 1, c: (CARD_WIDTH + CARD_SPACING) * 2 - 1 }
  });

  return ws;
}
