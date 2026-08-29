// Export Party Table Cards to Excel
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

  // Prepare data for both sheets
  const detailedData: any[] = [];
  const summaryData: any[] = [];

  sortedSlots.forEach((slot, index) => {
    const tableNumber = slot.tableNumber;

    // Group members by company
    const companyGroups: { [key: string]: CompanyGroup } = {};
    let totalMembers = 0;

    slot.groups.forEach((group) => {
      if (group.isReservation) {
        // For reservations, use reservation name as company name
        const reservationName = group.tableGroupName || 'โต๊ะจอง';
        const seats = group.reservedSeats || 0;

        if (!companyGroups[reservationName]) {
          companyGroups[reservationName] = {
            companyName: reservationName,
            members: [],
            count: 0,
          };
        }
        companyGroups[reservationName].count += seats;
        totalMembers += seats;
      } else {
        // For regular groups, list all members
        const companyName = group.hostCompanyName || 'ไม่ระบุบริษัท';

        if (!companyGroups[companyName]) {
          companyGroups[companyName] = {
            companyName: companyName,
            members: [],
            count: 0,
          };
        }

        group.members.forEach((member) => {
          companyGroups[companyName].members.push(member.name);
          companyGroups[companyName].count++;
          totalMembers++;
        });
      }
    });

    // Sheet 1: Detailed with member names
    const companies = Object.values(companyGroups);

    // Add table header row
    detailedData.push({
      'โต๊ะที่': `โต๊ะที่ ${tableNumber}`,
      'รายละเอียด': '',
      'จำนวนคน': `รวม ${totalMembers} คน`,
    });

    // Add empty row for spacing
    detailedData.push({
      'โต๊ะที่': '',
      'รายละเอียด': '',
      'จำนวนคน': '',
    });

    // Add company groups
    companies.forEach((company, idx) => {
      // Company header
      detailedData.push({
        'โต๊ะที่': '',
        'รายละเอียด': `${company.companyName}`,
        'จำนวนคน': `${company.count} คน`,
      });

      // Member names (only if not reservation)
      if (company.members.length > 0) {
        company.members.forEach((memberName) => {
          detailedData.push({
            'โต๊ะที่': '',
            'รายละเอียด': `  • ${memberName}`,
            'จำนวนคน': '',
          });
        });
      }

      // Spacing between companies
      if (idx < companies.length - 1) {
        detailedData.push({
          'โต๊ะที่': '',
          'รายละเอียด': '',
          'จำนวนคน': '',
        });
      }
    });

    // Add spacing between tables (2 empty rows)
    detailedData.push({ 'โต๊ะที่': '', 'รายละเอียด': '', 'จำนวนคน': '' });
    detailedData.push({ 'โต๊ะที่': '', 'รายละเอียด': '', 'จำนวนคน': '' });

    // Sheet 2: Summary without member names
    summaryData.push({
      'โต๊ะที่': `โต๊ะที่ ${tableNumber}`,
      'บริษัท/กลุ่ม': '',
      'จำนวนคน': `รวม ${totalMembers} คน`,
    });

    summaryData.push({
      'โต๊ะที่': '',
      'บริษัท/กลุ่ม': '',
      'จำนวนคน': '',
    });

    companies.forEach((company) => {
      summaryData.push({
        'โต๊ะที่': '',
        'บริษัท/กลุ่ม': company.companyName,
        'จำนวนคน': `${company.count} คน`,
      });
    });

    summaryData.push({ 'โต๊ะที่': '', 'บริษัท/กลุ่ม': '', 'จำนวนคน': '' });
    summaryData.push({ 'โต๊ะที่': '', 'บริษัท/กลุ่ม': '', 'จำนวนคน': '' });
  });

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Create detailed sheet
  const ws1 = XLSX.utils.json_to_sheet(detailedData);

  // Set column widths for detailed sheet
  ws1['!cols'] = [
    { wch: 15 }, // โต๊ะที่
    { wch: 40 }, // รายละเอียด
    { wch: 15 }, // จำนวนคน
  ];

  // Create summary sheet
  const ws2 = XLSX.utils.json_to_sheet(summaryData);

  // Set column widths for summary sheet
  ws2['!cols'] = [
    { wch: 15 }, // โต๊ะที่
    { wch: 40 }, // บริษัท/กลุ่ม
    { wch: 15 }, // จำนวนคน
  ];

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
