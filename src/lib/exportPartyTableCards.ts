// Export Party Table Cards to Excel with Beautiful Formatting
import * as XLSX from 'xlsx';

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

export function exportPartyTableCards(tableSlots: TableSlot[], eventName: string) {
  // Sort table slots by table number
  const sortedSlots = [...tableSlots].sort((a, b) => a.tableNumber - b.tableNumber);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Process each sheet
  const detailedData = createDetailedSheet(sortedSlots);
  const summaryData = createSummarySheet(sortedSlots);

  // Convert to worksheets
  const ws1 = XLSX.utils.aoa_to_sheet(detailedData);
  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);

  // Apply styling and column widths
  applyDetailedSheetFormatting(ws1, detailedData);
  applySummarySheetFormatting(ws2, summaryData);

  // Add sheets to workbook
  XLSX.utils.book_append_sheet(wb, ws1, 'การ์ดโต๊ะ (รายละเอียด)');
  XLSX.utils.book_append_sheet(wb, ws2, 'การ์ดโต๊ะ (สรุป)');

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
      // For reservations, use reservation name as company name
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
      // For regular members, group by EACH member's company name
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

function createDetailedSheet(sortedSlots: TableSlot[]): any[][] {
  const data: any[][] = [];

  sortedSlots.forEach((slot, tableIndex) => {
    const tableNumber = slot.tableNumber;
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Table header with background color (will be styled later)
    data.push(['โต๊ะที่ ' + tableNumber, '', 'รวม ' + totalMembers + ' คน']);
    data.push(['', '', '']); // Empty row

    // Add each company group
    companies.forEach((company, idx) => {
      // Company header row
      data.push(['', company.companyName, company.count + ' คน']);

      // Member names (only if not reservation)
      if (company.members.length > 0) {
        company.members.forEach((memberName) => {
          data.push(['', '  • ' + memberName, '']);
        });
      }

      // Add separator line between companies
      if (idx < companies.length - 1) {
        data.push(['', '─────────────────────────────────────', '']); // Horizontal line
      }
    });

    // Spacing between tables
    data.push(['', '', '']);
    data.push(['', '', '']);
  });

  return data;
}

function createSummarySheet(sortedSlots: TableSlot[]): any[][] {
  const data: any[][] = [];

  sortedSlots.forEach((slot, tableIndex) => {
    const tableNumber = slot.tableNumber;
    const companies = groupMembersByCompany(slot);
    const totalMembers = companies.reduce((sum, c) => sum + c.count, 0);

    // Table header with background color (will be styled later)
    data.push(['โต๊ะที่ ' + tableNumber, '', 'รวม ' + totalMembers + ' คน']);
    data.push(['', '', '']); // Empty row

    // Add each company group
    companies.forEach((company, idx) => {
      data.push(['', company.companyName, company.count + ' คน']);

      // Add separator line between companies
      if (idx < companies.length - 1) {
        data.push(['', '─────────────────────────────────────', '']);
      }
    });

    // Spacing between tables
    data.push(['', '', '']);
    data.push(['', '', '']);
  });

  return data;
}

function applyDetailedSheetFormatting(ws: XLSX.WorkSheet, data: any[][]) {
  // Set column widths
  ws['!cols'] = [
    { wch: 3 },  // Empty first column for spacing
    { wch: 45 }, // Main content column
    { wch: 15 }, // Count column
  ];

  // Set row heights for better spacing
  const rowHeights: XLSX.RowInfo[] = [];
  data.forEach((row, idx) => {
    const cellA = ws[XLSX.utils.encode_cell({ r: idx, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: idx, c: 1 })];
    const cellC = ws[XLSX.utils.encode_cell({ r: idx, c: 2 })];

    // Table header rows (contains "โต๊ะที่")
    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rowHeights[idx] = { hpt: 30 }; // Taller header

      // Style table header
      if (!cellA.s) cellA.s = {};
      if (!cellB.s) cellB.s = {};
      if (!cellC.s) cellC.s = {};

      // Bold, large font, centered, with background color
      [cellA, cellB, cellC].forEach(cell => {
        if (cell && cell.v !== '') {
          cell.s = {
            font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { fgColor: { rgb: '7C3AED' } }, // Purple background
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } },
            },
          };
        }
      });
    }
    // Company name rows (column B has company name, column C has count)
    else if (cellB && cellB.v && cellC && cellC.v && String(cellC.v).includes('คน') && !String(cellB.v).startsWith('  •')) {
      rowHeights[idx] = { hpt: 22 };

      // Style company header
      if (cellB && cellB.v && cellB.v !== '') {
        cellB.s = {
          font: { bold: true, sz: 12, color: { rgb: '1F2937' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          fill: { fgColor: { rgb: 'E5E7EB' } }, // Light gray background
        };
      }

      if (cellC && cellC.v) {
        cellC.s = {
          font: { bold: true, sz: 11, color: { rgb: '7C3AED' } },
          alignment: { horizontal: 'right', vertical: 'center' },
          fill: { fgColor: { rgb: 'E5E7EB' } },
        };
      }
    }
    // Member name rows (starts with •)
    else if (cellB && cellB.v && String(cellB.v).includes('•')) {
      rowHeights[idx] = { hpt: 18 };

      if (cellB) {
        cellB.s = {
          font: { sz: 11, color: { rgb: '4B5563' } },
          alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
        };
      }
    }
    // Separator lines
    else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rowHeights[idx] = { hpt: 8 };

      if (cellB) {
        cellB.s = {
          font: { color: { rgb: 'D1D5DB' } },
          alignment: { horizontal: 'center' },
        };
      }
    }
    // Empty rows
    else {
      rowHeights[idx] = { hpt: 12 };
    }
  });

  ws['!rows'] = rowHeights;
}

function applySummarySheetFormatting(ws: XLSX.WorkSheet, data: any[][]) {
  // Set column widths
  ws['!cols'] = [
    { wch: 3 },  // Empty first column for spacing
    { wch: 45 }, // Main content column
    { wch: 15 }, // Count column
  ];

  // Set row heights and styles (same as detailed sheet but without member rows)
  const rowHeights: XLSX.RowInfo[] = [];
  data.forEach((row, idx) => {
    const cellA = ws[XLSX.utils.encode_cell({ r: idx, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r: idx, c: 1 })];
    const cellC = ws[XLSX.utils.encode_cell({ r: idx, c: 2 })];

    // Table header rows
    if (cellA && cellA.v && String(cellA.v).startsWith('โต๊ะที่')) {
      rowHeights[idx] = { hpt: 30 };

      [cellA, cellB, cellC].forEach(cell => {
        if (cell && cell.v !== '') {
          cell.s = {
            font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { fgColor: { rgb: '7C3AED' } },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } },
            },
          };
        }
      });
    }
    // Company rows
    else if (cellB && cellB.v && cellC && cellC.v && String(cellC.v).includes('คน')) {
      rowHeights[idx] = { hpt: 24 };

      if (cellB && cellB.v && cellB.v !== '') {
        cellB.s = {
          font: { bold: true, sz: 13, color: { rgb: '1F2937' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          fill: { fgColor: { rgb: 'E5E7EB' } },
        };
      }

      if (cellC && cellC.v) {
        cellC.s = {
          font: { bold: true, sz: 12, color: { rgb: '7C3AED' } },
          alignment: { horizontal: 'right', vertical: 'center' },
          fill: { fgColor: { rgb: 'E5E7EB' } },
        };
      }
    }
    // Separator lines
    else if (cellB && cellB.v && String(cellB.v).includes('─')) {
      rowHeights[idx] = { hpt: 8 };

      if (cellB) {
        cellB.s = {
          font: { color: { rgb: 'D1D5DB' } },
          alignment: { horizontal: 'center' },
        };
      }
    }
    // Empty rows
    else {
      rowHeights[idx] = { hpt: 12 };
    }
  });

  ws['!rows'] = rowHeights;
}
