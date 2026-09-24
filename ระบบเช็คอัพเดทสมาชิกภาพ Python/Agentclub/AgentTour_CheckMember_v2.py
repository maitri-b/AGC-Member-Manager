# -*- coding: utf-8 -*-
#V2 Save to Google Sheet one by one
#V3 Change from Row to MemberID (Column A)
#V4 Add 3 search modes: Range, Custom, One Search
from googleapiclient.discovery import build
from google.oauth2 import service_account

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

SERVICE_ACCOUNT_FILE = 'keys.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

creds = None
creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES)

# The ID spreadsheet.
SAMPLE_SPREADSHEET_ID = '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0'

service = build('sheets', 'v4', credentials=creds)
sheet = service.spreadsheets()

# Function to convert Thai date to mm/dd/yyyy format (Christian Era)
# Input: "15 มีนาคม 2569" (Buddhist Era) -> Output: "03/15/2026" (Christian Era)
def convert_thai_date_to_mmddyyyy(date_str):
    month_mapping = {
        'มกราคม': '01',
        'กุมภาพันธ์': '02',
        'มีนาคม': '03',
        'เมษายน': '04',
        'พฤษภาคม': '05',
        'มิถุนายน': '06',
        'กรกฎาคม': '07',
        'สิงหาคม': '08',
        'กันยายน': '09',
        'ตุลาคม': '10',
        'พฤศจิกายน': '11',
        'พฤจิกายน': '11',
        'ธันวาคม': '12'
    }
    try:
        # Split "15 มีนาคม 2569" into parts
        parts = date_str.strip().split()
        if len(parts) != 3:
            return date_str  # Return original if format doesn't match

        day = parts[0].zfill(2)  # Pad with zero if needed (e.g., "5" -> "05")
        month_thai = parts[1]
        year_be = parts[2]  # Buddhist Era year

        # Convert Thai month to number
        month = month_mapping.get(month_thai, None)
        if month is None:
            return date_str  # Return original if month not found

        # Convert Buddhist Era to Christian Era (subtract 543)
        year_ce = str(int(year_be) - 543)

        # Return mm/dd/yyyy format in Christian Era
        return f"{month}/{day}/{year_ce}"
    except Exception:
        return date_str  # Return original on any error

# Function to load member data from Google Sheet
def load_member_data():
    print("Loading data from Google Sheet...")
    result = sheet.values().get(spreadsheetId=SAMPLE_SPREADSHEET_ID,
                                range="AGC_Membership!A:I").execute()
    all_data = result.get('values', [])

    member_map = {}
    for idx, row in enumerate(all_data):
        if idx == 0:
            continue
        if len(row) > 0 and row[0]:
            try:
                member_id = int(row[0])
                license_no = row[8] if len(row) > 8 else ''
                member_map[member_id] = {
                    'row': idx + 1,
                    'license': license_no
                }
            except ValueError:
                continue
    print(f"Loaded {len(member_map)} members\n")
    return member_map

# Function to check single member
def check_member(member_id, member_map):
    if member_id not in member_map:
        print(f"[SKIP] MemberID {member_id} - Not found in system")
        return False, 0

    member_info = member_map[member_id]
    row_number = member_info['row']
    license_no = member_info['license']

    if not license_no:
        print(f"[SKIP] MemberID {member_id} (Row {row_number}) - No license number")
        return False, 0

    print(f"[CHECK] MemberID {member_id} (Row {row_number}) - License: {license_no}")

    # Setup Chrome WebDriver
    options = webdriver.ChromeOptions()
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    driver = webdriver.Chrome(options=options)

    url = 'https://esvcs.dot.go.th/e-service/LicenseInformationPage'
    driver.get(url)

    try:
        wait = WebDriverWait(driver, 10)

        element_Searchbar = wait.until(EC.presence_of_element_located((By.ID, 'Search')))
        element_Searchbar.click()
        element_Searchbar.clear()
        element_Searchbar.send_keys(license_no)

        search_button = driver.find_element(By.XPATH, '//button[@type="button" and contains(@class, "text-gray-600")]')
        search_button.click()

        time.sleep(3)

        element_companyname = wait.until(EC.element_to_be_clickable((By.XPATH, '//a[contains(@href, "TourbusinessDetail")]')))
        element_companyname.click()

        time.sleep(2)

        element_companyName = wait.until(EC.presence_of_element_located((By.XPATH, '//h3[contains(@class, "text-3xl")]')))
        all_dd = driver.find_elements(By.XPATH, '//dd[contains(@class, "text-gray-700")]')

        element_expired = all_dd[2]
        element_status = all_dd[3]

        company_name_result = element_companyName.text
        license_status_result = element_status.text
        date_expired_result = convert_thai_date_to_mmddyyyy(element_expired.text)

        print(f"  [OK] Found: {license_status_result}")

    except Exception as e:
        print(f"  [ERROR] License: {license_no} - {e}")
        company_name_result = "ไม่พบข้อมูล"
        license_status_result = "ไม่พบข้อมูล"
        date_expired_result = "ไม่พบข้อมูล"

    finally:
        driver.quit()

    # Create formula for column T (วันที่หมดอายุ)
    # Column S (วันหมดอายุใบอนุญาต) already contains Christian Era year
    date_formula = f'=IF(S{row_number}<>"",DATE(YEAR(S{row_number}),MONTH(S{row_number}),DAY(S{row_number})),"")'

    # Write to Google Sheet columns Q, R, S, T
    # Q: บริษัท, R: สถานะ, S: วันหมดอายุใบอนุญาต, T: วันที่หมดอายุ
    update_values = [[company_name_result, license_status_result, date_expired_result, date_formula]]

    sheet.values().update(
        spreadsheetId=SAMPLE_SPREADSHEET_ID,
        range=f"AGC_Membership!Q{row_number}:T{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": update_values}
    ).execute()

    print(f"  [SAVED] Row {row_number}\n")
    return True, 1

# Main program loop
def main():
    print("=" * 60)
    print("   AgentTour - Check Member License with DOT Website")
    print("=" * 60)

    # Load member data once at start
    member_map = load_member_data()

    while True:
        print("\n" + "-" * 60)
        print("Select search mode:")
        print("  1. Range (Start ID - End ID)")
        print("  2. Custom (Multiple IDs separated by comma)")
        print("  3. One Search (Single ID)")
        print("  0. Exit")
        print("-" * 60)

        choice = input("Enter choice (0-3): ").strip()

        if choice == '0':
            print("\nGoodbye!")
            break

        member_ids = []

        if choice == '1':
            # Range mode
            try:
                start_id = int(input("Start MemberID: "))
                end_id = int(input("End MemberID: "))
                member_ids = list(range(start_id, end_id + 1))
                print(f"\nWill check MemberID from {start_id} to {end_id}")
            except ValueError:
                print("[ERROR] Invalid input. Please enter numbers only.")
                continue

        elif choice == '2':
            # Custom mode
            try:
                custom_input = input("Enter MemberIDs (separated by comma): ")
                member_ids = [int(x.strip()) for x in custom_input.split(',') if x.strip()]
                print(f"\nWill check {len(member_ids)} MemberIDs: {member_ids}")
            except ValueError:
                print("[ERROR] Invalid input. Please enter numbers separated by comma.")
                continue

        elif choice == '3':
            # One search mode
            try:
                single_id = int(input("Enter MemberID: "))
                member_ids = [single_id]
                print(f"\nWill check MemberID: {single_id}")
            except ValueError:
                print("[ERROR] Invalid input. Please enter a number.")
                continue
        else:
            print("[ERROR] Invalid choice. Please enter 0, 1, 2, or 3.")
            continue

        if not member_ids:
            print("[ERROR] No MemberID to check.")
            continue

        # Process members
        print("\n" + "=" * 60)
        processed_count = 0
        skipped_count = 0

        for member_id in member_ids:
            success, count = check_member(member_id, member_map)
            if success:
                processed_count += count
            else:
                skipped_count += 1

        print("=" * 60)
        print(f"Completed! Processed: {processed_count}, Skipped: {skipped_count}")
        print("=" * 60)

        # Ask to continue or exit
        print("\nWhat would you like to do next?")
        print("  1. Search again")
        print("  0. Exit")
        next_choice = input("Enter choice (0-1): ").strip()

        if next_choice == '0':
            print("\nGoodbye!")
            break
        # If choice is 1 or anything else, loop continues

if __name__ == "__main__":
    main()
    input("\nPress Enter to close...")
