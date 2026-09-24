from googleapiclient.discovery import build
from google.oauth2 import service_account

from selenium import webdriver 
from selenium.webdriver.common.by import By

SERVICE_ACCOUNT_FILE = 'keys.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

creds = None
creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES)


# The ID spreadsheet.
SAMPLE_SPREADSHEET_ID = '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0' #Copy From GGSheet URL

service = build('sheets', 'v4', credentials=creds)

# Call the Sheets API
sheet = service.spreadsheets()
result = sheet.values().get(spreadsheetId=SAMPLE_SPREADSHEET_ID,
                            range="Member_list!I2:I5").execute() #กำหนดจำนวนแถวของข้อมูลที่ไปค้นหาข้อมูลบริษัท

values = result.get('values', [])

license_status = []
date_expired = []
company_name = []

for license in values:
        #print(license[0])

        #=========================================
        #อ่านข้อมูลจากเวบแล้วเก็บค่า

        #แก้ Err ที่แสดงผลเรื่อง USB not connect
        options = webdriver.ChromeOptions()
        options.add_experimental_option('excludeSwitches', ['enable-logging'])
        driver = webdriver.Chrome(options=options)

        #driver = webdriver.Chrome()
        url = 'http://103.80.100.92:8087/mobiletourguide/info/license/tour/'
        driver.get(url)
        #license = '11/09795'

        #entry TAT License No.
        element_Searchbar = driver.find_element(By.NAME,'searchParam')
        element_Searchbar.click()
        element_Searchbar.send_keys(license)
        element_Searchbar.submit()

        # Click to result - Company name
        element_companyname = driver.find_element(By.XPATH,'//ul[@class="listview"]//li')
        element_companyname.click()

        #Check If License is 'ปกติ' or 'ยกเลิกใบอนุญาต'
        element_status = driver.find_element(By.XPATH, '//div[@class="span8"]//p//span')
        element_companyName = driver.find_element(By.XPATH, '//h4[@class="fg-color-blue"]')
        element_address = driver.find_element(By.TAG_NAME, 'address')
        element_expired = driver.find_element(By.XPATH, '//blockquote[@class="bg-color-blueLight padding20 tertiary-text1"]//p[last()]') #มี tag p อยู่ 4 ตัว เลือกตัวที่ 4

        license_status.append(element_status.text) #list สถานะ
        date_expired.append(element_expired.text) #list วันหมดอายุ
        company_name.append(element_companyName.text) #list ชื่อบริษัท
                
count = len(license_status) #จำนวน row ของผลลัพธ์
#x = license_status[0]
#print(x)
i = 0 
status_and_expired =""
group_lists=[]
while i < count:
        status_and_expired = company_name[i] + "," + license_status[i] + "," + date_expired[i] #ดึงค่าจาก 2 list มาเก็บเป็น list ใหม่
        i = i+1

        status_expired_list = status_and_expired.split(",")     #สร้าง list ใหม่
        group_lists.append(status_expired_list) #list ซ้อน list เป็นเป็นตัวแปลบันทึกลง google sheet
        print(status_expired_list)

print("\n")
print(group_lists)
print("\n")
  
        #=============\\\\============================

  


#aoa = [["11/3/2022",4400],["6/3/2022",8800],["22/5/2022",3300]]

#เขียนค่าลงบน Googlesheet
request = sheet.values().update(spreadsheetId=SAMPLE_SPREADSHEET_ID, 
                            range="Member_list!Q201", valueInputOption="USER_ENTERED", body={"values":group_lists}).execute()

'''
print(license_status)
print("\n")
print(date_expired)
print("\n")
print(count)
'''